import { useEffect, useRef, useState } from 'preact/hooks'
import type { ContentUnit, DrumType as DataDrumType } from '../../data/types'
import { RhythmGrid, type DrillSequence, type DrumType as GridDrumType } from './RhythmGrid'
import { GrooveCircle } from '../canvas/GrooveCircle'
import { categoriseTiming } from '../../workers/timingBands'
import { midiEngine, type HitEvent } from '../../audio/midi'
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
import { progressionStore, isMastered } from '../../store'
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
    if (phase !== 'playing') return
    const unsub = midiEngine.onHit((hit: HitEvent) => {
      if (grooveCircleRef.current) {
        const category = categoriseTiming(hit.deltaMs, unit.passCriteria.timingWindowMs)
        grooveCircleRef.current.registerHit(hit.deltaMs, category)
      }
    })
    return unsub
  }, [phase, unit.passCriteria.timingWindowMs])

  // Hydrate the mastery badge from storage. This is what makes persistence
  // observable: pass the drill, reload, and the badge is still there.
  useEffect(() => {
    let cancelled = false
    void progressionStore.load().then((state) => {
      if (!cancelled) setMastered(isMastered(state, unit.id))
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
      isDrillPlaying.value = detail.phase === 'playing' || detail.phase === 'count-in'
    }
    window.addEventListener(DRILL_PHASE_EVENT, onPhase)
    return () => {
      window.removeEventListener(DRILL_PHASE_EVENT, onPhase)
      runnerRef.current?.cancel()
    }
  }, [worker])

  // The click that starts the drill is also the user gesture that unlocks audio.
  const start = async () => {
    setResult(null)
    setCountInBeat(0)
    const startedAt = Date.now()
    try {
      const r = await runnerRef.current!.run(unit)
      setResult(r)
      // Persist before refreshing the badge, so the badge reflects stored state.
      await recordCompletion(r, startedAt)
      setMastered(await progressionStore.load().then((s) => isMastered(s, unit.id)))
    } catch (err) {
      setAudioLocked(true)
      setPhase('idle')
      console.warn('[DrillSession]', err)
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

        {phase === 'idle' && !result && (
          <button class="drill-start" onClick={start} data-testid="drill-start">
            Start
          </button>
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
          >
            <div class="result-verdict">{result.passed ? 'Passed' : 'Not yet'}</div>
            <p class="result-headline" data-testid="result-diagnosis">
              {result.diagnosis.headline}
            </p>
            {result.diagnosis.detail && <p class="result-detail">{result.diagnosis.detail}</p>}
            <div class="result-stats" data-testid="result-accuracy">
              {result.accuracyPercent.toFixed(0)}% in the window · {result.numHits} hits recorded
            </div>
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
