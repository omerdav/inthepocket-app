import { describe, it, expect } from 'vitest'
import {
  evaluate,
  SAMPLE_SCHEDULE_MS,
  DECISION_WINDOW_MS,
  WEDGED_RATIO,
} from '../audio-preflight.mjs'

/**
 * The preflight's judgement, tested without a browser.
 *
 * The numbers below are measured, not invented. The wedged set is the real
 * 2026-08-24 fault — `currentTime` frozen at one 512-frame quantum (10.7ms).
 * The healthy set is a real run on the same machine after it recovered.
 */

const WEDGED = SAMPLE_SCHEDULE_MS.map((wall) => ({ wall, audio: 10.7 }))
const HEALTHY = [
  { wall: 255, audio: 191.6 },
  { wall: 534, audio: 470.2 },
  { wall: 1047, audio: 981.0 },
  { wall: 3100, audio: 3030.2 },
]
/** A machine mid-recovery: indistinguishable from wedged for the first half-second. */
const SLOW_START = [
  { wall: 256, audio: 11.6 },
  { wall: 527, audio: 11.6 },
  { wall: 1040, audio: 510.8 },
  { wall: 3099, audio: 2571.6 },
]

describe('audio preflight judgement', () => {
  it('detects the real observed wedge', () => {
    expect(evaluate(WEDGED).verdict).toBe('wedged')
  })

  it('passes a healthy clock', () => {
    expect(evaluate(HEALTHY).verdict).toBe('ok')
  })

  it('does not fail a machine that merely starts slowly', () => {
    // The first two samples here sit at 0.045 and 0.022 — below the wedged
    // threshold. Judging them would fail a working machine, which is how a
    // preflight earns a reputation for crying wolf and gets deleted.
    expect(evaluate(SLOW_START).verdict).toBe('ok')
  })

  it('reports inconclusive rather than passing when nothing was judged', () => {
    // THE GUARD THAT MATTERS. The original probe judged inline against a
    // literal 3000 coupled by hand to the sample schedule. Moved out of step,
    // no sample is judged and a frozen clock exits 0 — demonstrated with the
    // last sample at 2900ms and every ratio at 0.001.
    const tooEarly = [
      { wall: 255, audio: 0.3 },
      { wall: 522, audio: 0.5 },
      { wall: 1039, audio: 1.1 },
      { wall: 2900, audio: 2.9 },
    ]
    const result = evaluate(tooEarly)
    expect(result.verdict, 'a fully wedged clock must never be reported as ok').not.toBe('ok')
    expect(result.verdict).toBe('inconclusive')
    expect(result.judged).toBe(0)
  })

  it('keeps the schedule and the decision window coupled', () => {
    // Guards the guard: if someone shortens the schedule, this fails here
    // rather than silently disarming the probe in production.
    expect(
      Math.max(...SAMPLE_SCHEDULE_MS),
      'the sample schedule no longer reaches the decision window'
    ).toBeGreaterThanOrEqual(DECISION_WINDOW_MS)
  })

  it('leaves daylight between wedged and healthy', () => {
    const wedgedRatio = 10.7 / 3095
    const healthyRatio = 3030.2 / 3100
    expect(wedgedRatio).toBeLessThan(WEDGED_RATIO)
    expect(healthyRatio).toBeGreaterThan(WEDGED_RATIO)
  })
})
