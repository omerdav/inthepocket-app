import type { DrillResult } from '../../session/DrillRunner';
import { MAX_PLACEMENT_DEPTH, type Depth, type SkillCategory } from '../../store/ProgressionStore';

export function calculatePlacement(
  category: SkillCategory,
  result: DrillResult
): Depth {
  if (result.error || !result.passed) {
    return 'introduction';
  }

  // To cap at MAX_PLACEMENT_DEPTH (which is 'consolidating'), we will only ever return up to that.
  let depth: Depth = 'introduction';

  if (result.accuracyPercent > 90) {
    depth = 'consolidating';
  } else if (result.accuracyPercent > 70) {
    depth = 'developing';
  } else {
    depth = 'introduction';
  }

  // We enforce the cap explicitly just in case MAX_PLACEMENT_DEPTH changes in the future,
  // but currently 'consolidating' is the max.
  const depthValues: Record<Depth, number> = {
    'introduction': 0,
    'developing': 1,
    'consolidating': 2,
    'mastery': 3,
  };

  const currentVal = depthValues[depth];
  const maxVal = depthValues[MAX_PLACEMENT_DEPTH];

  if (currentVal > maxVal) {
    return MAX_PLACEMENT_DEPTH;
  }

  return depth;
}
