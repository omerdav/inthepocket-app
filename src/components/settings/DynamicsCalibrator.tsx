import { useState, useEffect, useRef } from 'preact/hooks'
import { signal, useSignalEffect } from '@preact/signals'
import { midiEngine } from '../../audio/midi'
import { profilesStore } from '../../store'
import { setDynamicsCalibration } from '../../data/dynamics'
import {
  calibrate,
  MIN_SAMPLES_PER_INTENT,
  STROKE_INTENTS,
  type StrokeIntent,
} from '../../data/dynamicsCalibration'
import './DynamicsCalibrator.css'

/**
 * Teach the app how hard this drummer hits (Release_Plan 7.2).
 *
 * `dynamics-gate-drill-3` and `-5` demand a ghost note in MIDI velocity 15–35
 * and an accent at 90–127. Those are one module's factory curve written down as
 * if universal, and on a kit that puts a genuine ghost note at 45 the drummer
 * fails every one of them while playing correctly.
 *
 * Eight strikes per level, three levels, on the snare. It asks for *soft*,
 * *normal* and *hard* rather than "ghost" and "accent" — a drummer knows what
 * those mean without being taught the app's vocabulary first.
 */

export const isDynamicsCalibratorOpen = signal(false)

const PROMPT: Record<StrokeIntent, { title: string; hint: string }> = {
  soft: { title: 'Play SOFT', hint: 'Ghost notes. As light as you would play them in a groove.' },
  normal: { title: 'Play NORMAL', hint: 'Your ordinary stroke. Neither ghosted nor accented.' },
  hard: { title: 'Play HARD', hint: 'Accents. As you would actually hit them, not as hard as you can.' },
}

type Stage = StrokeIntent | 'done' | 'refused'

export function DynamicsCalibrator() {
  /**
   * Stage and samples are ONE piece of state, updated atomically.
   *
   * They were two, and the subscription closed over `stage`. Strikes arriving
   * between a stage change and the effect re-subscribing were filed under the
   * stage that had just ended, so a run of 8 soft, 8 normal, 8 hard put
   * sixteen strikes into `soft` and left `normal` empty. Driving the flow in a
   * browser is the only reason that surfaced — every unit test passed.
   */
  const [state, setState] = useState<{ stage: Stage; samples: Record<StrokeIntent, number[]> }>({
    stage: 'soft',
    samples: { soft: [], normal: [], hard: [] },
  })
  const [refusal, setRefusal] = useState<string>('')
  const [result, setResult] = useState<{ ghostMax: number; accentMin: number } | null>(null)

  const stage = state.stage
  const samples = state.samples

  const reset = () => {
    setState({ stage: 'soft', samples: { soft: [], normal: [], hard: [] } })
    setRefusal('')
    setResult(null)
  }

  /**
   * Reset on the transition into open, not on every render.
   *
   * `useSignalEffect` re-runs whenever its callback is re-created, which is
   * every render — and a render happens on every strike. Resetting there sent
   * the stage back to `soft` after each hit, so the flow could never advance.
   * The ref makes it fire once per opening.
   */
  const wasOpen = useRef(false)
  useSignalEffect(() => {
    const open = isDynamicsCalibratorOpen.value
    if (open && !wasOpen.current) reset()
    wasOpen.current = open
  })

  useEffect(() => {
    if (!isDynamicsCalibratorOpen.value) return

    // Subscribed once for the whole flow. The stage is read inside the
    // functional update, never from this closure.
    const unsub = midiEngine.onHit((hit) => {
      // Canonical hits, not raw notes: this measures how hard a *snare* was
      // hit, so it wants the stream with crosstalk already filtered out.
      if (hit.note !== 38 && hit.note !== 40) return

      setState((prev) => {
        if (prev.stage === 'done' || prev.stage === 'refused') return prev

        const current = prev.stage
        const samples = { ...prev.samples, [current]: [...prev.samples[current], hit.velocity] }
        if (samples[current].length < MIN_SAMPLES_PER_INTENT) {
          return { stage: current, samples }
        }

        const order = STROKE_INTENTS.indexOf(current)
        if (order < STROKE_INTENTS.length - 1) {
          return { stage: STROKE_INTENTS[order + 1], samples }
        }

        const outcome = calibrate(samples)
        if (outcome.ok) {
          setResult({
            ghostMax: outcome.calibration.ghostMax,
            accentMin: outcome.calibration.accentMin,
          })
          setDynamicsCalibration(outcome.calibration)
          void profilesStore.saveDynamicsCalibration(outcome.calibration)
          return { stage: 'done', samples }
        }

        // Refusing beats inventing a threshold that would fail them at
        // random — the mistake the decoupling score made for weeks.
        setRefusal(outcome.reason)
        return { stage: 'refused', samples }
      })
    })

    return unsub
  }, [isDynamicsCalibratorOpen.value])

  useEffect(() => {
    if (!isDynamicsCalibratorOpen.value) return

    const onSelect = () => {
      if (stage === 'done') isDynamicsCalibratorOpen.value = false
      else if (stage === 'refused') reset()
    }
    window.addEventListener('stick-select', onSelect)
    return () => window.removeEventListener('stick-select', onSelect)
  }, [isDynamicsCalibratorOpen.value, stage])

  if (!isDynamicsCalibratorOpen.value) return null

  const active = stage === 'done' || stage === 'refused' ? null : stage
  const counted = active ? samples[active].length : 0

  return (
    <div class="dyn-cal" data-testid="dynamics-calibrator" data-stage={stage}>
      <h2>Dynamics</h2>

      {active && (
        <div class="dyn-cal-step">
          <p class="dyn-cal-title">{PROMPT[active].title}</p>
          <p class="dyn-cal-hint">{PROMPT[active].hint}</p>
          <p class="dyn-cal-count" data-testid="dyn-cal-count">
            {counted} / {MIN_SAMPLES_PER_INTENT}
          </p>
          <p class="dyn-cal-foot">Hit the snare. Any tempo — only how hard matters.</p>
        </div>
      )}

      {stage === 'done' && result && (
        <div class="dyn-cal-step">
          <p class="dyn-cal-title dyn-cal-ok">Calibrated</p>
          <p class="dyn-cal-hint">
            On this kit, a ghost note is anything up to <strong>{result.ghostMax}</strong> and an
            accent starts at <strong>{result.accentMin}</strong>. The drills now judge you against
            those, not against the factory numbers.
          </p>
          <p class="dyn-cal-foot">Hit the snare to close.</p>
        </div>
      )}

      {stage === 'refused' && (
        <div class="dyn-cal-step">
          <p class="dyn-cal-title dyn-cal-warn">Not calibrated</p>
          <p class="dyn-cal-hint" data-testid="dyn-cal-refusal">{refusal}</p>
          <p class="dyn-cal-foot">Hit the snare to try again.</p>
        </div>
      )}

      <button class="tab-btn dyn-cal-close" onClick={() => (isDynamicsCalibratorOpen.value = false)}>
        Close (mouse)
      </button>
    </div>
  )
}
