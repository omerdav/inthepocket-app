import { type Depth, type SkillCategory, MAX_PLACEMENT_DEPTH, isDeeperThan } from '../../store/ProgressionStore';

export type DiagnosticPerformance = 'skipped' | 'failed' | 'basic' | 'consistent' | 'strong';

/**
 * Calculates a single category's placement depth based on the drummer's performance.
 * Follows the Skill Placement Model (v2026-08).
 */
export function calculateCategoryPlacement(performance: DiagnosticPerformance): Depth {
  let proposed: Depth;
  
  switch (performance) {
    case 'skipped':
    case 'failed':
      proposed = 'introduction';
      break;
    case 'basic':
      proposed = 'developing';
      break;
    case 'consistent':
      proposed = 'consolidating';
      break;
    case 'strong':
      proposed = 'mastery';
      break;
  }
  
  // Placement is capped so a drummer cannot vault past content they actually need based on a 2-minute diagnostic.
  return isDeeperThan(proposed, MAX_PLACEMENT_DEPTH) ? MAX_PLACEMENT_DEPTH : proposed;
}

/**
 * Pure function to map raw per-category performance into depths.
 */
export function calculatePlacement(
  results: Record<SkillCategory, DiagnosticPerformance>
): Record<SkillCategory, Depth> {
  return {
    timing: calculateCategoryPlacement(results.timing),
    dynamics: calculateCategoryPlacement(results.dynamics),
    independence: calculateCategoryPlacement(results.independence),
  };
}
