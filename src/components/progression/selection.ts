import type { ProgressionState, SkillCategory, Depth } from '../../store/ProgressionStore';

export interface ProgressionRecommendation {
  categoryDepths: Record<SkillCategory, Depth>;
  streak: { current: number; longest: number };
  nextDrillId: string | null;
}

/**
 * Derives what to show and recommend from the raw progression state.
 *
 * "Next" rule: Longest untouched unmastered drill.
 * Justification: Motor learning for drumming relies on spaced repetition and sleep
 * consolidation. Hammering a single unmastered drill endlessly in one session causes
 * fatigue and bad habits. Recommending the unmastered drill the drummer hasn't touched
 * in the longest time encourages rotating between different exercises, giving the brain
 * time to consolidate the patterns between attempts.
 */
export function getProgressionRecommendation(state: ProgressionState): ProgressionRecommendation {
  let nextDrillId: string | null = null;
  
  const unmastered = Object.values(state.drills).filter(d => d.masteredAt === null);
  if (unmastered.length > 0) {
    unmastered.sort((a, b) => a.lastAttemptAt - b.lastAttemptAt);
    nextDrillId = unmastered[0].drillId;
  }

  return {
    categoryDepths: state.depths,
    streak: {
      current: state.streak.current,
      longest: state.streak.longest
    },
    nextDrillId,
  };
}
