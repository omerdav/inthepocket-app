import { SCORING_CATEGORIES, YELLOW_WINDOW_RATIO, type ScoringCategory } from './scoring.types'

/**
 * Classify a timing offset into a scoring band.
 *
 * Extracted from `ScoringWorker`, where this lived inline. The worker is not
 * the only thing that needs to band a hit: the Groove Circle colours hits as
 * they land, live, and cannot wait for the worker's end-of-drill result.
 *
 * Keeping it in one place matters more than it looks. If the live visual and
 * the recorded score ever disagree about what counts as green, a drummer sees
 * feedback that contradicts the grade they are given — and has no way to tell
 * which one is lying.
 *
 * @param deltaMs signed offset from the nearest beat; negative = early
 * @param timingWindowMs the drill's GREEN half-window, from its PassCriteria
 */
export function categoriseTiming(
  deltaMs: number,
  timingWindowMs: number = DEFAULT_TIMING_WINDOW_MS
): ScoringCategory {
  const absDelta = Math.abs(deltaMs)
  if (absDelta <= timingWindowMs) return SCORING_CATEGORIES.GREEN
  if (absDelta <= timingWindowMs * YELLOW_WINDOW_RATIO) return SCORING_CATEGORIES.YELLOW
  return SCORING_CATEGORIES.RED
}

/**
 * Fallback GREEN window when a drill does not state one. Matches the value the
 * worker used before `PassCriteria.timingWindowMs` was honoured, so behaviour
 * is unchanged for content that omits it.
 */
export const DEFAULT_TIMING_WINDOW_MS = 30
