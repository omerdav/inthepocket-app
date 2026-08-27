import type { DrillResult } from '../../session/DrillRunner';
import { MAX_PLACEMENT_DEPTH, type Depth, type SkillCategory } from '../../store/ProgressionStore';

/** Shared depth bands, so the three categories cannot drift apart. */
function depthFromPercent(percent: number): Depth {
  if (percent > 90) return 'consolidating';
  if (percent > 70) return 'developing';
  return 'introduction';
}

export function calculatePlacement(
  category: SkillCategory,
  result: DrillResult
): Depth | null {
  if (result.error === 'cancelled') {
    return null;
  }

  if (result.error || !result.passed) {
    return 'introduction';
  }

  // To cap at MAX_PLACEMENT_DEPTH (which is 'consolidating'), we will only ever return up to that.
  let depth: Depth = 'introduction';

  // Each category is measured by the thing it is about.
  //
  // `accuracyPercent` counts GREEN categories only, which is **timing**. Using
  // it for all three placed a drummer's dynamics depth according to how well
  // they kept time — so someone with excellent time and flat dynamics was
  // placed at consolidating for dynamics. The pass/fail boundary was already
  // right (`passed` ANDs dynamics in), but the depth above it was not.
  switch (category) {
    case 'timing':
      depth = depthFromPercent(result.accuracyPercent);
      break;

    case 'dynamics': {
      // dynamicScores is 1 per note whose velocity landed inside its target
      // window, 0 otherwise. That is the dynamics measurement.
      const scored = result.dynamicScores.length;
      let hit = 0;
      for (let i = 0; i < scored; i++) if (result.dynamicScores[i] === 1) hit++;
      depth = depthFromPercent(scored ? (hit / scored) * 100 : 0);
      break;
    }

    case 'independence':
      // Independence has no honest measurement yet. `decouplingScore` returns
      // undefined on every drill this short (register Q-2 — the metric needs
      // 16 grid slots and the diagnostic segments have four), so there is
      // nothing to grade on but timing while playing an independence pattern.
      // That is weaker than it looks and is deliberately not dressed up:
      // holding the pattern at all is the thing being observed.
      depth = depthFromPercent(result.accuracyPercent);
      break;
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
