import { describe, it, expect } from 'vitest'
import {
  createMetronomeSab,
  nearestBeatDeltaMs,
  SAB_NEXT_BEAT_NS,
  SAB_PERIOD_NS,
  NS_PER_SEC,
} from '../metronomeSab'

/** Build a SAB view describing a beat grid. */
function grid(nextBeatSec: number, periodSec: number): BigInt64Array {
  const view = new BigInt64Array(createMetronomeSab())
  Atomics.store(view, SAB_NEXT_BEAT_NS, BigInt(Math.round(nextBeatSec * NS_PER_SEC)))
  Atomics.store(view, SAB_PERIOD_NS, BigInt(Math.round(periodSec * NS_PER_SEC)))
  return view
}

describe('nearestBeatDeltaMs', () => {
  // 120 BPM => 0.5s period, next beat at t=10s.
  const view = grid(10, 0.5)

  it('reports zero exactly on the beat', () => {
    expect(nearestBeatDeltaMs(view, 10)).toBeCloseTo(0, 6)
  })

  it('reports negative for early hits', () => {
    expect(nearestBeatDeltaMs(view, 10 - 0.02)).toBeCloseTo(-20, 6)
  })

  it('reports positive for late hits', () => {
    expect(nearestBeatDeltaMs(view, 10 + 0.02)).toBeCloseTo(20, 6)
  })

  it('folds forward across multiple beats', () => {
    // Three beats past the reference, 5ms late.
    expect(nearestBeatDeltaMs(view, 10 + 1.5 + 0.005)).toBeCloseTo(5, 6)
  })

  it('folds backward before the reference beat', () => {
    // Two beats before the reference, 8ms early.
    expect(nearestBeatDeltaMs(view, 10 - 1.0 - 0.008)).toBeCloseTo(-8, 6)
  })

  it('never reports more than half a period in either direction', () => {
    // This is the property the old next-beat differencing violated: a hit
    // landing just after a beat was reported as nearly a full period early.
    for (let offsetMs = -2000; offsetMs <= 2000; offsetMs += 7) {
      const d = nearestBeatDeltaMs(view, 10 + offsetMs / 1000)
      expect(Math.abs(d)).toBeLessThanOrEqual(250 + 1e-6)
    }
  })

  it('snaps past the midpoint to the following beat', () => {
    // 260ms late is closer to the next beat (240ms early) than to this one.
    expect(nearestBeatDeltaMs(view, 10 + 0.26)).toBeCloseTo(-240, 6)
  })

  it('a hit 5ms after a beat reads as 5ms late, not a period early', () => {
    // Regression guard for the specific bug this replaced.
    const d = nearestBeatDeltaMs(view, 10.005)
    expect(d).toBeCloseTo(5, 6)
    expect(d).toBeGreaterThan(0)
  })

  it('returns 0 when the metronome is stopped (period 0)', () => {
    const stopped = grid(10, 0)
    expect(nearestBeatDeltaMs(stopped, 12.345)).toBe(0)
  })

  it('scales with tempo', () => {
    const fast = grid(4, 0.3) // 200 BPM
    expect(nearestBeatDeltaMs(fast, 4.01)).toBeCloseTo(10, 6)
    expect(nearestBeatDeltaMs(fast, 4 + 0.9 - 0.012)).toBeCloseTo(-12, 6)
  })
})
