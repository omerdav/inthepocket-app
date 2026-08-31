import { describe, it, expect } from 'vitest'
import { MemoryStore } from '../db'
import {
  ProgressionStore,
  applyDrillResult,
  applyPlacement,
  applyStreak,
  emptyProgression,
  isMastered,
  isDeeperThan,
  dayKey,
  MAX_PLACEMENT_DEPTH,
} from '../ProgressionStore'
import { offsetStats, TelemetryStore } from '../TelemetryStore'
import { ProfilesStore } from '../ProfilesStore'

const DAY = 86_400_000
const T0 = Date.parse('2026-03-02T10:00:00Z')

describe('progression rules', () => {
  it('counts an attempt whether or not it passed', () => {
    let s = emptyProgression()
    s = applyDrillResult(s, { drillId: 'd1', passed: false, accuracyPercent: 40 }, T0)
    s = applyDrillResult(s, { drillId: 'd1', passed: true, accuracyPercent: 95 }, T0)

    expect(s.drills.d1.attempts).toBe(2)
    expect(s.drills.d1.passes).toBe(1)
  })

  it('keeps the best accuracy, not the latest', () => {
    let s = emptyProgression()
    s = applyDrillResult(s, { drillId: 'd1', passed: true, accuracyPercent: 95 }, T0)
    s = applyDrillResult(s, { drillId: 'd1', passed: false, accuracyPercent: 30 }, T0)

    expect(s.drills.d1.bestAccuracyPercent).toBe(95)
  })

  it('marks mastery on the first pass and never un-masters it', () => {
    let s = emptyProgression()
    expect(isMastered(s, 'd1')).toBe(false)

    s = applyDrillResult(s, { drillId: 'd1', passed: true, accuracyPercent: 95 }, T0)
    expect(isMastered(s, 'd1')).toBe(true)
    const masteredAt = s.drills.d1.masteredAt

    // A later bad day must not revoke a skill the drummer demonstrated.
    s = applyDrillResult(s, { drillId: 'd1', passed: false, accuracyPercent: 12 }, T0 + DAY)
    expect(isMastered(s, 'd1')).toBe(true)
    expect(s.drills.d1.masteredAt).toBe(masteredAt)
  })

  it('tracks drills independently', () => {
    let s = emptyProgression()
    s = applyDrillResult(s, { drillId: 'd1', passed: true, accuracyPercent: 95 }, T0)
    expect(isMastered(s, 'd2')).toBe(false)
  })
})

describe('practice streak', () => {
  it('increments on consecutive days', () => {
    let streak = applyStreak(emptyProgression().streak, T0)
    expect(streak.current).toBe(1)

    streak = applyStreak(streak, T0 + DAY)
    expect(streak.current).toBe(2)

    streak = applyStreak(streak, T0 + 2 * DAY)
    expect(streak.current).toBe(3)
  })

  it('does not double-count two sessions on the same day', () => {
    let streak = applyStreak(emptyProgression().streak, T0)
    streak = applyStreak(streak, T0 + 3600_000)
    expect(streak.current).toBe(1)
  })

  it('resets after a missed day but remembers the longest run', () => {
    let streak = emptyProgression().streak
    for (let d = 0; d < 5; d++) streak = applyStreak(streak, T0 + d * DAY)
    expect(streak.current).toBe(5)

    streak = applyStreak(streak, T0 + 7 * DAY) // skipped a day
    expect(streak.current).toBe(1)
    expect(streak.longest).toBe(5)
  })

  it('counts a failed attempt — practising on a hard day still counts', () => {
    const s = applyDrillResult(
      emptyProgression(),
      { drillId: 'd1', passed: false, accuracyPercent: 10 },
      T0
    )
    expect(s.streak.current).toBe(1)
  })

  it('uses UTC day keys so travel does not break a streak', () => {
    expect(dayKey(Date.parse('2026-03-02T23:59:00Z'))).toBe('2026-03-02')
    expect(dayKey(Date.parse('2026-03-03T00:01:00Z'))).toBe('2026-03-03')
  })
})

describe('placement', () => {
  it('sets depth per category, independently', () => {
    const s = applyPlacement(
      emptyProgression(),
      { timing: 'consolidating', dynamics: 'introduction' },
      T0
    )
    expect(s.depths.timing).toBe('consolidating')
    expect(s.depths.dynamics).toBe('introduction')
    // Untouched categories keep their existing depth.
    expect(s.depths.independence).toBe('introduction')
    expect(s.placementCompletedAt).toBe(T0)
  })

  it('caps placement below mastery — that must be earned in the app', () => {
    const s = applyPlacement(emptyProgression(), { timing: 'mastery' }, T0)
    expect(s.depths.timing).toBe(MAX_PLACEMENT_DEPTH)
    expect(isDeeperThan(s.depths.timing, MAX_PLACEMENT_DEPTH)).toBe(false)
  })
})

describe('offsetStats', () => {
  it('separates a consistent rusher from a scattered player', () => {
    // Both average about -30ms; only the spread tells them apart. This is the
    // distinction the placement model calls the one that matters most.
    const rusher = offsetStats([-31, -29, -30, -30, -30], 5)
    const scattered = offsetStats([-90, 30, -60, 10, -40], 5)

    expect(rusher.meanOffsetMs).toBeCloseTo(-30, 1)
    expect(scattered.meanOffsetMs).toBeCloseTo(-30, 1)
    expect(rusher.offsetStdDevMs).toBeLessThan(2)
    expect(scattered.offsetStdDevMs).toBeGreaterThan(40)
  })

  it('returns zeros for an empty run rather than NaN', () => {
    expect(offsetStats([], 0)).toEqual({ meanOffsetMs: 0, offsetStdDevMs: 0 })
  })

  it('ignores trailing buffer slots beyond count', () => {
    const padded = [10, 10, 999, 999]
    expect(offsetStats(padded, 2).meanOffsetMs).toBe(10)
  })
})

describe('stores round-trip through the backend', () => {
  it('persists and reloads progression', async () => {
    const db = new MemoryStore()
    const store = new ProgressionStore(db)

    await store.recordDrillResult({ drillId: 'd1', passed: true, accuracyPercent: 91 }, T0)

    const reloaded = await new ProgressionStore(db).load()
    expect(reloaded.drills.d1.passes).toBe(1)
    expect(reloaded.streak.current).toBe(1)
  })

  it('returns an empty state rather than undefined on a fresh install', async () => {
    const state = await new ProgressionStore(new MemoryStore()).load()
    expect(state.drills).toEqual({})
    expect(state.depths.timing).toBe('introduction')
  })

  it('keeps telemetry newest-first and filterable by drill', async () => {
    const db = new MemoryStore()
    const store = new TelemetryStore(db)
    const base = {
      passed: true,
      accuracyPercent: 90,
      meanOffsetMs: 0,
      offsetStdDevMs: 5,
      diagnosisHeadline: 'In the pocket.',
      numTargets: 16,
      numHits: 16,
    }
    await store.record({ ...base, id: 'a', drillId: 'd1', startedAt: T0 })
    await store.record({ ...base, id: 'b', drillId: 'd2', startedAt: T0 + 1000 })
    await store.record({ ...base, id: 'c', drillId: 'd1', startedAt: T0 + 2000 })

    expect((await store.history()).map((r) => r.id)).toEqual(['c', 'b', 'a'])
    expect((await store.forDrill('d1')).map((r) => r.id)).toEqual(['c', 'a'])
  })

  it('persists hi-hat calibration, including inverted polarity', async () => {
    const db = new MemoryStore()
    const store = new ProfilesStore(db)

    // Yamaha-style: closed reads lower than open.
    await store.saveHiHatCalibration(127, 0, { now: T0 })

    const reloaded = await new ProfilesStore(db).hiHatCalibration()
    expect(reloaded).toMatchObject({ min: 127, max: 0, calibratedAt: T0 })
  })
})
