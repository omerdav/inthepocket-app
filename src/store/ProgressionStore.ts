import { STORE_PROGRESSION, type KeyValueStore } from './db'

/**
 * The drummer's permanent record: what they have attempted, what they have
 * mastered, and how deep they sit in each skill category.
 *
 * Distinct from telemetry. Telemetry is "what happened in a session";
 * progression is "what the drummer is allowed to reach", which is why it needs
 * its own store rather than being derived from session history on every load.
 *
 * Categories and depths follow Skill_Placement_Model.md: placement is
 * per-category, and there is deliberately no single overall level.
 */

export type SkillCategory = 'timing' | 'dynamics' | 'independence'

export const SKILL_CATEGORIES: SkillCategory[] = ['timing', 'dynamics', 'independence']

/** Ordered shallow → deep. Index doubles as the comparison key. */
export const DEPTHS = ['introduction', 'developing', 'consolidating', 'mastery'] as const
export type Depth = (typeof DEPTHS)[number]

/**
 * Placement is capped below `mastery`: that depth must be earned in the app,
 * not asserted by two minutes of playing (Skill_Placement_Model §4).
 */
export const MAX_PLACEMENT_DEPTH: Depth = 'consolidating'

export interface DrillProgress {
  drillId: string
  attempts: number
  passes: number
  bestAccuracyPercent: number
  lastAttemptAt: number
  /** Timestamp of the first pass. Null until mastered. */
  masteredAt: number | null
}

export interface PracticeStreak {
  current: number
  longest: number
  /** ISO date (YYYY-MM-DD) of the last day with a completed drill. */
  lastPracticeDay: string | null
}

export interface ProgressionState {
  drills: Record<string, DrillProgress>
  depths: Record<SkillCategory, Depth>
  placementCompletedAt: number | null
  placementSkippedAt: number | null
  streak: PracticeStreak
}

const PROGRESSION_KEY = 'state'

export function emptyProgression(): ProgressionState {
  return {
    drills: {},
    depths: { timing: 'introduction', dynamics: 'introduction', independence: 'introduction' },
    placementCompletedAt: null,
    placementSkippedAt: null,
    streak: { current: 0, longest: 0, lastPracticeDay: null },
  }
}

export function isDeeperThan(a: Depth, b: Depth): boolean {
  return DEPTHS.indexOf(a) > DEPTHS.indexOf(b)
}

/** UTC date key. Local dates would shift a drummer's streak when they travel. */
export function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a)
  return Math.round(ms / 86_400_000)
}

/**
 * Fold a completed drill into progression state. Pure, so the rules are
 * unit-testable without a database.
 */
export function applyDrillResult(
  state: ProgressionState,
  result: { drillId: string; passed: boolean; accuracyPercent: number },
  now: number
): ProgressionState {
  const previous = state.drills[result.drillId]
  const drill: DrillProgress = {
    drillId: result.drillId,
    attempts: (previous?.attempts ?? 0) + 1,
    passes: (previous?.passes ?? 0) + (result.passed ? 1 : 0),
    bestAccuracyPercent: Math.max(previous?.bestAccuracyPercent ?? 0, result.accuracyPercent),
    lastAttemptAt: now,
    masteredAt: previous?.masteredAt ?? (result.passed ? now : null),
  }

  return {
    ...state,
    drills: { ...state.drills, [result.drillId]: drill },
    streak: applyStreak(state.streak, now),
  }
}

/**
 * Streaks count days on which a drill was completed — passed or not.
 * Requiring a pass would punish exactly the drummer who practised hardest on
 * the day they struggled most.
 */
export function applyStreak(streak: PracticeStreak, now: number): PracticeStreak {
  const today = dayKey(now)
  if (streak.lastPracticeDay === today) return streak

  const gap = streak.lastPracticeDay ? daysBetween(streak.lastPracticeDay, today) : Infinity
  const current = gap === 1 ? streak.current + 1 : 1

  return {
    current,
    longest: Math.max(streak.longest, current),
    lastPracticeDay: today,
  }
}

export function setDepth(
  state: ProgressionState,
  category: SkillCategory,
  depth: Depth
): ProgressionState {
  return { ...state, depths: { ...state.depths, [category]: depth } }
}

/** Record a placement result, capped per Skill_Placement_Model §4. */
export function applyPlacement(
  state: ProgressionState,
  depths: Partial<Record<SkillCategory, Depth>>,
  now: number
): ProgressionState {
  const next = { ...state.depths }
  for (const category of SKILL_CATEGORIES) {
    const proposed = depths[category]
    if (!proposed) continue
    next[category] = isDeeperThan(proposed, MAX_PLACEMENT_DEPTH) ? MAX_PLACEMENT_DEPTH : proposed
  }
  return { ...state, depths: next, placementCompletedAt: now }
}

export function applyPlacementSkip(state: ProgressionState, now: number): ProgressionState {
  return { ...state, placementSkippedAt: now }
}

export function isMastered(state: ProgressionState, drillId: string): boolean {
  return state.drills[drillId]?.masteredAt != null
}

// ---------------------------------------------------------------------------

export class ProgressionStore {
  // Explicit field rather than a constructor parameter property, which
  // `erasableSyntaxOnly` forbids.
  private _db: KeyValueStore

  constructor(db: KeyValueStore) {
    this._db = db
  }

  async load(): Promise<ProgressionState> {
    const stored = await this._db.get<ProgressionState>(STORE_PROGRESSION, PROGRESSION_KEY)
    // Merge over a fresh object so a schema addition does not read as undefined
    // on a record written by an earlier version.
    return stored ? { ...emptyProgression(), ...stored } : emptyProgression()
  }

  async save(state: ProgressionState): Promise<void> {
    await this._db.put(STORE_PROGRESSION, PROGRESSION_KEY, state)
  }

  async recordDrillResult(
    result: { drillId: string; passed: boolean; accuracyPercent: number },
    now = Date.now()
  ): Promise<ProgressionState> {
    const next = applyDrillResult(await this.load(), result, now)
    await this.save(next)
    return next
  }

  async recordPlacement(
    depths: Partial<Record<SkillCategory, Depth>>,
    now = Date.now()
  ): Promise<ProgressionState> {
    const next = applyPlacement(await this.load(), depths, now)
    await this.save(next)
    return next
  }

  async recordPlacementSkip(now = Date.now()): Promise<ProgressionState> {
    const next = applyPlacementSkip(await this.load(), now)
    await this.save(next)
    return next
  }

  async reset(): Promise<void> {
    await this._db.clear(STORE_PROGRESSION)
  }
}
