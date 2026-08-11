import { useEffect, useRef, useState } from 'preact/hooks'
import type { ContentUnit, DrumType as DataDrumType } from '../../data/types'
import { DRUM_TYPE_TO_DISPLAY_NAME } from '../../data/zoneNames'
import { RhythmGrid, type DrillSequence, type DrumType as GridDrumType } from './RhythmGrid'
import { GrooveCircle } from '../canvas/GrooveCircle'
import { categoriseTiming } from '../../workers/timingBands'
import { midiEngine, type HitEvent } from '../../audio/midi'
import { audioEngine } from '../../audio/AudioEngine'
import {
  DrillRunner,
  DRILL_PHASE_EVENT,
  type DrillPhase,
  type DrillPhaseDetail,
  type DrillResult,
} from '../../session/DrillRunner'
import { useSignalEffect } from '@preact/signals'
import { isDrillPlaying } from '../../state/session'
import { pendingLaunchId } from '../../state/routing'
import { recordCompletion } from '../../session/recordCompletion'
import { progressionStore, isMastered, profilesStore } from '../../store'
import { checkHardwareCapability, type HardwareCapabilityResult } from '../../session/hardware'
import './DrillSession.css'

/** The grid renders three staff positions; map the zone model onto them. */
const ZONE_TO_STAFF: Record<DataDrumType, GridDrumType> = {
  'snare-head': 'snare',
  'snare-rim': 'snare',
  kick: 'kick',
  'hihat-open': 'hihat',
  'hihat-closed': 'hihat',
  'hihat-chick': 'hihat',
}

function toGridSequence(unit: ContentUnit): DrillSequence {
  return unit.sequence.map((n) => ({
    targetTimeMs: n.targetTimeMs,
    drumType: ZONE_TO_STAFF[n.drumType],
    sticking: n.sticking,
    isAccent: n.isAccent,
  }))
}

interface Props {
  unit: ContentUnit
  worker: Worker
}

export function DrillSession({ unit, worker }: Props) {
  const [phase, setPhase] = useState<DrillPhase>('idle')
  const [countInBeat, setCountInBeat] = useState(0)
  const [result, setResult] = useState<DrillResult | null>(null)
  const [audioLocked, setAudioLocked] = useState(false)
  const [mastered, setMastered] = useState(false)
  const [hardwareBlock, setHardwareBlock] = useState<HardwareCapabilityResult | null>(null)
  const [hardwareWarnings, setHardwareWarnings] = useState<DataDrumType[]>([])
  const [startPerfMs, setStartPerfMs] = useState<number | null>(null)
  const runnerRef = useRef<DrillRunner | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const grooveCircleRef = useRef<GrooveCircle | null>(null)

  useEffect(() => {
    if (canvasContainerRef.current && !grooveCircleRef.current) {
      const gc = new GrooveCircle({
        bpm: unit.bpm,
        timeSignature: 4,
        canvasSize: 320
      })
      gc.mount(canvasContainerRef.current)
      grooveCircleRef.current = gc
    }
    return () => {
      if (grooveCircleRef.current) {
        grooveCircleRef.current.unmount()
        grooveCircleRef.current = null
      }
    }
  }, [unit.bpm])

  useEffect(() => {
    if (grooveCircleRef.current) {
      if (phase === 'count-in' || phase === 'playing') {
        grooveCircleRef.current.start()
      } else {
        grooveCircleRef.current.stop()
      }
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing' || startPerfMs === null) return
    const unsub = midiEngine.onHit((hit: HitEvent) => {
      if (grooveCircleRef.current) {
        let deltaMs = hit.deltaMs;
        const correlator = audioEngine.correlator;
        
        if (correlator) {
          const hitAudioMs = correlator.mapHitTime(hit.timestamp) * 1000;
          const startAudioMs = correlator.mapHitTime(startPerfMs) * 1000;
          
          let minAbs = Infinity;
          for (let i = 0; i < unit.sequence.length; i++) {
             const targetAudioMs = startAudioMs + unit.sequence[i].targetTimeMs;
             const diff = hitAudioMs - targetAudioMs;
             if (Math.abs(diff) < minAbs) {
               minAbs = Math.abs(diff);
               deltaMs = diff;
             }
          }
        }

        const category = categoriseTiming(deltaMs, unit.passCriteria.timingWindowMs)
        grooveCircleRef.current.registerHit(deltaMs, category)
      }
    })
    return unsub
  }, [phase, startPerfMs, unit.sequence, unit.passCriteria.timingWindowMs])

  // Hydrate the mastery badge from storage. This is what makes persistence
  // observable: pass the drill, reload, and the badge is still there.
  useEffect(() => {
    let cancelled = false
    void progressionStore.load().then((state) => {
      if (!cancelled) setMastered(isMastered(state, unit.id))
    })
    
    // Also evaluate hardware warnings before the user clicks start
    void profilesStore.load().then(profile => {
      if (cancelled) return
      const cap = checkHardwareCapability(unit, profile.noteMap, midiEngine)
      setHardwareWarnings(cap.warnings)
    })
    
    return () => {
      cancelled = true
    }
  }, [unit.id])

  useEffect(() => {
    runnerRef.current = new DrillRunner(worker)

    const onPhase = (e: Event) => {
      const detail = (e as CustomEvent<DrillPhaseDetail>).detail
      setPhase(detail.phase)
      if (detail.countInBeat) setCountInBeat(detail.countInBeat)
      if (detail.startPerfMs !== undefined) setStartPerfMs(detail.startPerfMs)
      isDrillPlaying.value = detail.phase === 'playing' || detail.phase === 'count-in'
    }
    window.addEventListener(DRILL_PHASE_EVENT, onPhase)
    return () => {
      window.removeEventListener(DRILL_PHASE_EVENT, onPhase)
      runnerRef.current?.cancel()
    }
  }, [worker])

  const start = async () => {
    setResult(null)
    setCountInBeat(0)
    setHardwareBlock(null)
    
    // Unlock audio immediately from the gesture, before any async storage reads
    // that might consume the transient user activation window.
    const unlocked = await audioEngine.unlock()
    if (!unlocked) {
      setAudioLocked(true)
      setPhase('idle')
      return
    }

    const profile = await profilesStore.load()
    const cap = checkHardwareCapability(unit, profile.noteMap, midiEngine)
    if (!cap.ok) {
      setHardwareBlock(cap)
      return
    }

    const startedAt = Date.now()
    try {
      const r = await runnerRef.current!.run(unit)
      setResult(r)
      // Persist before refreshing the badge, so the badge reflects stored state.
      await recordCompletion(r, startedAt)
      setMastered(await progressionStore.load().then((s) => isMastered(s, unit.id)))
    } catch (err) {
      console.warn('[DrillSession]', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Audio is locked')) {
        setAudioLocked(true)
        window.dispatchEvent(new CustomEvent(DRILL_PHASE_EVENT, { detail: { phase: 'idle', unitId: unit.id } }))
      } else {
        let detail = 'The drill could not complete because the browser audio engine stalled or failed to start. Please try again.'
        if (msg.includes('Metronome did not start')) {
          detail = 'The metronome failed to start. Please try again.'
        }
        setResult({
          unitId: unit.id,
          passed: false,
          accuracyPercent: 0,
          diagnosis: {
            headline: 'Audio System Interrupted',
            detail,
            beats: [],
          },
          numTargets: unit.sequence.length,
          numHits: 0,
          categories: new Int8Array(0),
          offsets: new Float32Array(0),
          dynamicScores: new Int8Array(0),
          diagnosticRuleIds: new Uint8Array(0),
          struckZones: new Int8Array(0),
          error: 'audio-stall',
        })
        window.dispatchEvent(new CustomEvent(DRILL_PHASE_EVENT, { detail: { phase: 'complete', unitId: unit.id } }))
      }
    }
  }

  // One-touch launch from the menu (pointer or stick). Selecting the drill is
  // itself the user gesture, so the audio unlock still has a real activation
  // behind it. Runs on mount and whenever the pending id changes, which covers
  // both re-selecting the current drill and switching to a different one.
  useSignalEffect(() => {
    if (pendingLaunchId.value !== unit.id) return
    pendingLaunchId.value = null
    void start()
  })

  const busy = phase === 'count-in' || phase === 'playing' || phase === 'scoring'

  return (
    <section class="drill-session" data-phase={phase} data-testid="drill-session">
      {/* Zone 1 — context */}
      <header class="drill-top">
        <div class="drill-name" data-testid="drill-name">
          {unit.category} — {unit.name}
        </div>
        {mastered && (
          <span class="drill-mastered" data-testid="drill-mastered" title="Passed previously">
            ✓ Mastered
          </span>
        )}
        <div class="drill-bpm">
          <span class="bpm-value">{unit.bpm}</span>
          <span class="bpm-label">BPM</span>
        </div>
      </header>

      {/* Zone 2 — the pulse */}
      <div class="drill-center">
        <div ref={canvasContainerRef} class="groove-circle-container" />

        {phase === 'idle' && !result && !hardwareBlock && (
          <div class="drill-start-container">
            {hardwareWarnings.length > 0 && (
              <p class="hardware-warning" data-testid="hardware-warning">
                ⚠️ This drill uses {hardwareWarnings.map(w => DRUM_TYPE_TO_DISPLAY_NAME[w]).join(' and ')}, but we haven't detected one yet.
              </p>
            )}
            <button class="drill-start" onClick={start} data-testid="drill-start">
              Start
            </button>
          </div>
        )}
        
        {hardwareBlock && (
          <div class="drill-result failed" data-testid="hardware-block">
            <div class="result-verdict">Cannot Play Drill</div>
            <p class="result-headline" data-testid="hardware-block-msg">
              This drill uses {hardwareBlock.missing.map(m => DRUM_TYPE_TO_DISPLAY_NAME[m]).join(' and ')}, but your kit doesn't have a separate zone for it.
            </p>
            <button class="drill-start again" onClick={() => setHardwareBlock(null)}>
              Back
            </button>
          </div>
        )}

        {phase === 'count-in' && (
          <div class="count-in" data-testid="count-in">
            {countInBeat || '·'}
          </div>
        )}

        {phase === 'playing' && (
          <div class="playing-pulse" data-testid="playing">
            <span>PLAY</span>
          </div>
        )}

        {phase === 'scoring' && <div class="scoring" data-testid="scoring">Scoring…</div>}

        {result && phase === 'complete' && (
          <div
            class={`drill-result ${result.passed ? 'passed' : 'failed'}`}
            data-testid="drill-result"
            data-passed={String(result.passed)}
            data-error={result.error || ''}
          >
            <div class="result-verdict">
              {result.passed ? 'Passed' : (result.error === 'audio-stall' ? 'Interrupted' : 'Not yet')}
            </div>
            <p class="result-headline" data-testid="result-diagnosis">
              {result.diagnosis.headline}
            </p>
            {result.diagnosis.detail && <p class="result-detail">{result.diagnosis.detail}</p>}
            <div class="result-stats" data-testid="result-accuracy">
              {result.accuracyPercent.toFixed(0)}% in the window · {result.numHits} hits recorded
            </div>
            {unit.passCriteria.decouplingScoreThreshold !== undefined && result.decouplingScore !== undefined && (
              <div class="result-stats result-decoupling" data-testid="result-decoupling">
                Decoupling score: {result.decouplingScore.toFixed(2)} (target: ≤ {unit.passCriteria.decouplingScoreThreshold})
              </div>
            )}
            <button class="drill-start again" onClick={start} data-testid="drill-retry">
              Again
            </button>
          </div>
        )}

        {audioLocked && (
          <p class="audio-locked" data-testid="audio-locked">
            Audio is blocked by the browser. Tap Start to enable sound.
          </p>
        )}
      </div>

      {/* Zone 3 — notation */}
      <footer class="drill-bottom">
        <RhythmGrid sequence={toGridSequence(unit)} />
      </footer>

      {busy && <div class="drill-busy-veil" aria-hidden="true" />}
    </section>
  )
}
