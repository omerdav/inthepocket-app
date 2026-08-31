import type { ContentUnit } from '../data/types'
import { DRUM_TYPE_TO_MIDI } from '../data/utils'
import { resolveVelocityRange } from '../data/dynamics'
import { audioEngine } from '../audio/AudioEngine'
import { midiEngine, type HitEvent } from '../audio/midi'
import { evaluateDrillPass } from '../data/bootcamps/dynamics-gate'
import { evaluateIndependencePass } from '../data/bootcamps/hihat-independence'
import { diagnose, type DrillDiagnosis } from './diagnosis'
import type {
  ScoringWorkerCalculateMessage,
  ScoringWorkerResultMessage,
} from '../workers/scoring.types'
import { SCORING_CATEGORIES } from '../workers/scoring.types'
import { SAB_NEXT_BEAT_NS, SAB_RUNNING, NS_PER_SEC } from '../audio/metronomeSab'
import { explainAudioStall } from '../audio/audioDeviceWatch'

/**
 * Plays a ContentUnit and grades it.
 *
 * This is the loop that turns the engine into an application: count-in on the
 * click, collect real MIDI hits against the audio clock, score them, and return
 * a specific diagnosis. Before this existed the bootcamp content was authored
 * data that nothing rendered and nothing played.
 */

export type DrillPhase = 'idle' | 'count-in' | 'playing' | 'scoring' | 'complete'

export interface DrillPhaseDetail {
  phase: DrillPhase
  unitId: string
  /** `performance.now()` value at which the drill's note 0 lands. */
  startPerfMs?: number
  /** Count-in beat currently sounding, 1-based. */
  countInBeat?: number
}

export interface DrillResult {
  unitId: string
  passed: boolean
  accuracyPercent: number
  diagnosis: DrillDiagnosis
  numTargets: number
  numHits: number
  categories: Int8Array
  offsets: Float32Array
  dynamicScores: Int8Array
  diagnosticRuleIds: Uint8Array
  struckZones: Int8Array
  decouplingScore?: number
  error?: 'audio-stall' | 'cancelled' | 'kit-disconnected'
}

/** Emitted on `window` so both the UI and tests can observe real phase changes. */
export const DRILL_PHASE_EVENT = 'itp-drill-phase'

const COUNT_IN_BEATS = 4
/** Grace period after the last note before scoring, for late hits. */
const TAIL_MS = 400

interface RecordedHit {
  audioTimeMs: number
  velocity: number
  note: number
}

export class DrillRunner {
  private _worker: Worker
  private _phase: DrillPhase = 'idle'
  private _abort = false

  constructor(worker: Worker) {
    this._worker = worker
  }

  get phase(): DrillPhase {
    return this._phase
  }

  private _emit(detail: DrillPhaseDetail): void {
    this._phase = detail.phase
    window.dispatchEvent(new CustomEvent<DrillPhaseDetail>(DRILL_PHASE_EVENT, { detail }))
  }

  cancel(): void {
    this._abort = true
  }

  /**
   * Run one drill start-to-finish.
   *
   * Must be called from a path where audio is already unlocked — see
   * `AudioEngine.init()`. Rejects if the context could not start, rather than
   * silently running a metronome the drummer cannot hear.
   */
  async run(unit: ContentUnit, beatsPerBar = 4): Promise<DrillResult> {
    this._abort = false

    const unlocked = await audioEngine.unlock()
    if (!unlocked) {
      throw new Error('Audio is locked: a user gesture is required before a drill can start.')
    }

    const view = audioEngine.view
    const correlator = audioEngine.correlator
    const ctx = audioEngine.context
    if (!view || !correlator || !ctx) throw new Error('AudioEngine failed to initialise.')

    audioEngine.start(unit.bpm, beatsPerBar)

    const periodSec = 60 / unit.bpm

    // Wait for the worklet to publish its first beat so the count-in is
    // anchored to the real audio grid rather than a guess.
    try {
      // Inside the try on purpose: this is where "Metronome did not start"
      // comes from, and it deserves the same named handling as every other
      // engine failure rather than escaping to DrillSession's backstop.
      const firstBeatSec = await this._awaitFirstBeat(view, ctx)
      const drillStartSec = firstBeatSec + COUNT_IN_BEATS * periodSec

      // --- count-in ---------------------------------------------------------
      this._emit({ phase: 'count-in', unitId: unit.id })
      for (let b = 0; b < COUNT_IN_BEATS; b++) {
        const beatSec = firstBeatSec + b * periodSec
        await this._sleepUntilAudioTime(ctx, beatSec)
        if (this._abort) return this._abortResult(unit, 'cancelled', 'Drill cancelled.', '')
        this._emit({ phase: 'count-in', unitId: unit.id, countInBeat: b + 1 })
      }

      // --- collect ----------------------------------------------------------
      const hits: RecordedHit[] = []
      const unsubscribe = midiEngine.onHit((hit: HitEvent) => {
        hits.push({
          audioTimeMs: correlator.mapHitTime(hit.timestamp) * 1000,
          velocity: hit.velocity,
          note: hit.note,
        })
      })
      midiEngine.setDrillActive(true)

      const lastNoteMs = unit.sequence.reduce((max, n) => Math.max(max, n.targetTimeMs), 0)
      const endSec = drillStartSec + (lastNoteMs + TAIL_MS) / 1000

      // Publish the exact start so the UI (and tests) can align to it.
      this._emit({
        phase: 'playing',
        unitId: unit.id,
        startPerfMs: this._audioToPerfMs(correlator, drillStartSec),
      })

      await this._sleepUntilAudioTime(ctx, endSec)

      unsubscribe()
      midiEngine.setDrillActive(false)
      audioEngine.stop()

      if (this._abort) return this._abortResult(unit, 'cancelled', 'Drill cancelled.', '')

      // --- score ------------------------------------------------------------
      this._emit({ phase: 'scoring', unitId: unit.id })
      const result = await this._score(unit, hits, drillStartSec)
      this._emit({ phase: 'complete', unitId: unit.id })
      return result
    } catch (e: any) {
      midiEngine.setDrillActive(false)
      audioEngine.stop()
      
      if (e.message === 'kit-disconnected') {
        return this._abortResult(unit, 'kit-disconnected', 'Kit Disconnected', 'Your drum kit was unplugged mid-drill.')
      } else if (e.message === 'tab-hidden') {
        return this._abortResult(unit, 'audio-stall', 'Drill Paused', 'The drill was stopped because the tab was hidden.')
      } else if (e.message === 'audio-stall') {
        return this._abortResult(unit, 'audio-stall', 'Audio System Interrupted', explainAudioStall(Date.now()))
      } else if (e.message.includes('Metronome did not start')) {
        return this._abortResult(unit, 'audio-stall', 'Audio System Interrupted', 'The metronome failed to start. Please try again.')
      }
      throw e
    }
  }

  /** Convert an audio-clock time back to the performance clock. */
  private _audioToPerfMs(
    correlator: { mapHitTime(ms: number): number },
    audioSec: number
  ): number {
    // mapHitTime is affine: audio = a*perf + b. Invert by probing two points
    // rather than reaching into private fields.
    const p0 = 0
    const p1 = 1000
    const a0 = correlator.mapHitTime(p0)
    const a1 = correlator.mapHitTime(p1)
    const slope = (a1 - a0) / (p1 - p0)
    return slope === 0 ? performance.now() : (audioSec - a0) / slope
  }

  private async _awaitFirstBeat(view: BigInt64Array, ctx: AudioContext): Promise<number> {
    const deadline = performance.now() + 2000
    for (;;) {
      if (Atomics.load(view, SAB_RUNNING) === 1n) {
        const next = Number(Atomics.load(view, SAB_NEXT_BEAT_NS)) / NS_PER_SEC
        if (next > ctx.currentTime) return next
      }
      if (performance.now() > deadline) {
        throw new Error('Metronome did not start within 2s.')
      }
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  /** Sleep until an absolute AudioContext time, correcting for timer drift. */
  private async _sleepUntilAudioTime(ctx: AudioContext, targetSec: number): Promise<void> {
    let lastAudioTime = ctx.currentTime;
    let lastAdvanceTime = performance.now();

    for (;;) {
      const currentAudioTime = ctx.currentTime;
      if (currentAudioTime > lastAudioTime) {
        lastAudioTime = currentAudioTime;
        lastAdvanceTime = performance.now();
      } else if (performance.now() - lastAdvanceTime > 2000) {
        throw new Error('audio-stall');
      }

      if (!midiEngine.isKitConnected) {
        throw new Error('kit-disconnected');
      }

      // `visibilityState` rather than `hidden`: the spec defines hidden as
      // visibilityState !== 'visible', so this is the canonical property, and
      // it is the one a test can simulate without having to override two
      // getters that a real browser changes together.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        throw new Error('tab-hidden');
      }

      const remainingMs = (targetSec - currentAudioTime) * 1000
      if (remainingMs <= 1 || this._abort) return
      // Sleep most of the way, then re-check; setTimeout alone drifts.
      await new Promise((r) => setTimeout(r, Math.min(remainingMs - 1, 50)))
    }
  }

  private _abortResult(unit: ContentUnit, error: DrillResult['error'], headline: string, detail: string): DrillResult {
    // 'cancelled' means the drummer chose to stop, so there is nothing to
    // report and the phase returns to idle. Every other abort is something
    // that happened TO them — a kit unplugged, an engine stalled — and they
    // must be told, which means 'complete', because DrillSession renders the
    // result screen only in that phase.
    //
    // Emitting 'idle' for an error set the result in state and then never
    // showed it: the drummer's kit died mid-drill and the screen simply went
    // back to Start with no explanation.
    this._emit({ phase: error === 'cancelled' ? 'idle' : 'complete', unitId: unit.id })
    return {
      unitId: unit.id,
      passed: false,
      accuracyPercent: 0,
      diagnosis: { headline, detail, beats: [] },
      numTargets: unit.sequence.length,
      numHits: 0,
      categories: new Int8Array(0),
      offsets: new Float32Array(0),
      dynamicScores: new Int8Array(0),
      diagnosticRuleIds: new Uint8Array(0),
      struckZones: new Int8Array(0),
      decouplingScore: undefined,
      error,
    }
  }

  private _score(
    unit: ContentUnit,
    hits: RecordedHit[],
    drillStartSec: number
  ): Promise<DrillResult> {
    const n = unit.sequence.length
    const targetBeats = new Float64Array(n)
    const targetVelocityMin = new Float32Array(n)
    const targetVelocityMax = new Float32Array(n)
    const targetZones = new Int8Array(n)

    for (let i = 0; i < n; i++) {
      const note = unit.sequence[i]
      targetBeats[i] = drillStartSec * 1000 + note.targetTimeMs
      // Judged against this drummer's own kit, not one module's factory curve
      // (7.2). With no calibration set this returns exactly the constants the
      // ternary above used to, so the audit is unaffected.
      const range = resolveVelocityRange(note)
      targetVelocityMin[i] = range.min
      targetVelocityMax[i] = range.max
      targetZones[i] = DRUM_TYPE_TO_MIDI[note.drumType]
    }

    const m = hits.length
    const hitTimestamps = new Float64Array(m)
    const hitVelocities = new Float32Array(m)
    const hitZones = new Int8Array(m)
    for (let i = 0; i < m; i++) {
      hitTimestamps[i] = hits[i].audioTimeMs
      hitVelocities[i] = hits[i].velocity
      hitZones[i] = hits[i].note
    }

    return new Promise<DrillResult>((resolve) => {
      const onMessage = (event: MessageEvent<ScoringWorkerResultMessage>) => {
        const msg = event.data
        if (msg.type !== 'result') return
        this._worker.removeEventListener('message', onMessage)

        const categories = msg.categories.slice(0, msg.numResults)
        const offsets = msg.offsets.slice(0, msg.numResults)
        const dynamicScores = msg.dynamicScores.slice(0, msg.numResults)
        const diagnosticRuleIds = msg.diagnosticRuleIds.slice(0, msg.numResults)
        const struckZones = msg.struckZones.slice(0, msg.numResults)

        let valid = 0
        for (let i = 0; i < msg.numResults; i++) {
          if (
            categories[i] === SCORING_CATEGORIES.GREEN
          ) {
            valid++
          }
        }
        const accuracyPercent = msg.numResults ? (valid / msg.numResults) * 100 : 0

        let passed = false;
        let passMessage: string | undefined;

        if (unit.passCriteria.decouplingScoreThreshold !== undefined) {
          const evalResult = evaluateIndependencePass(unit, categories, msg.decouplingScore);
          passed = evalResult.passed;
          passMessage = evalResult.message;
        } else {
          passed = evaluateDrillPass(unit, categories, dynamicScores, diagnosticRuleIds);
        }

        const diagnosis = diagnose(unit, categories, diagnosticRuleIds, offsets, msg.numResults, struckZones);

        if (passMessage && !passed) {
          diagnosis.detail = diagnosis.headline;
          diagnosis.headline = passMessage;
        }

        resolve({
          unitId: unit.id,
          passed,
          accuracyPercent,
          diagnosis,
          numTargets: msg.numResults,
          numHits: m,
          categories,
          offsets,
          dynamicScores,
          diagnosticRuleIds,
          struckZones,
          decouplingScore: msg.decouplingScore,
        })
      }

      this._worker.addEventListener('message', onMessage)

      const message: ScoringWorkerCalculateMessage = {
        type: 'calculate',
        targetBeats,
        targetVelocityMin,
        targetVelocityMax,
        targetZones,
        hitTimestamps,
        hitVelocities,
        hitZones,
        numTargets: n,
        numHits: m,
        timingWindowMs: unit.passCriteria.timingWindowMs,
      }
      this._worker.postMessage(message)
    })
  }
}
