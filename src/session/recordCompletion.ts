import type { DrillResult } from './DrillRunner'
import { SCORING_CATEGORIES } from '../workers/scoring.types'
import { offsetStats, type SessionRecord } from '../store/TelemetryStore'
import { progressionStore, telemetryStore } from '../store'

/**
 * Fold a finished drill into the permanent record: one telemetry row, one
 * progression update.
 *
 * Before this, mastery gating gated nothing across a reload — a drummer could
 * pass the graduation drill and the app would forget by the time they sat back
 * down.
 */

/** Build the telemetry row. Pure, so the derived numbers are testable. */
export function buildSessionRecord(
  result: DrillResult,
  startedAt: number,
  id = `${startedAt}-${result.unitId}`
): SessionRecord {
  // Missed targets carry an offset of 0, which would drag the mean toward zero
  // and shrink the spread — exactly the two numbers used to tell a rusher from
  // a scattered player. Score only the targets that were actually struck.
  const scored: number[] = []
  for (let i = 0; i < result.numTargets; i++) {
    if (result.categories[i] !== SCORING_CATEGORIES.MISS) scored.push(result.offsets[i])
  }

  const { meanOffsetMs, offsetStdDevMs } = offsetStats(scored, scored.length)

  return {
    id,
    drillId: result.unitId,
    startedAt,
    passed: result.passed,
    accuracyPercent: result.accuracyPercent,
    meanOffsetMs,
    offsetStdDevMs,
    diagnosisHeadline: result.diagnosis.headline,
    numTargets: result.numTargets,
    numHits: result.numHits,
  }
}

export async function recordCompletion(result: DrillResult, startedAt: number): Promise<void> {
  if (result.error) return // Do not record interrupted or cancelled sessions.
  await telemetryStore.record(buildSessionRecord(result, startedAt))
  await progressionStore.recordDrillResult({
    drillId: result.unitId,
    passed: result.passed,
    accuracyPercent: result.accuracyPercent,
  })
}
