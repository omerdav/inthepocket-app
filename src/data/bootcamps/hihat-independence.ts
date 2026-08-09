import type { ContentUnit, DrillNote } from '../types';
import { TOLERANCE_BANDS } from '../toleranceBands';
import { SCORING_CATEGORIES } from '../../workers/scoring.types';

/**
 * Hi-Hat Independence Bootcamp
 * Tier 2 Curriculum
 */

export const HiHatIndependenceDrill1: ContentUnit = {
  id: 'hh-indep-1',
  name: 'Ostinato',
  tier: 'Bootcamp',
  category: 'Hi-Hat Independence',
  bpm: 80,
  sequence: generateHiHatSequence(80, 2), // Quarter note chicks for 2 bars
  passCriteria: {
    ...TOLERANCE_BANDS.Developing,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 2,
  },
  failureDiagnostics: [],
};

export const HiHatIndependenceDrill2: ContentUnit = {
  id: 'hh-indep-2',
  name: 'Basic Decoupling',
  tier: 'Bootcamp',
  category: 'Hi-Hat Independence',
  bpm: 80,
  sequence: ([
    ...generateHiHatSequence(80, 2),
    // Add snare on 2 and 4
    ...generateSnareBackbeat(80, 2)
  ] satisfies DrillNote[]).sort((a, b) => a.targetTimeMs - b.targetTimeMs),
  passCriteria: {
    ...TOLERANCE_BANDS.Consolidating,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 2,
    decouplingScoreThreshold: 0.59, // < 0.6
  },
  failureDiagnostics: [],
};

export const HiHatIndependenceDrill3: ContentUnit = {
  id: 'hh-indep-3',
  name: 'Complex Decoupling',
  tier: 'Bootcamp',
  category: 'Hi-Hat Independence',
  bpm: 80,
  sequence: ([
    ...generateHiHatSequence(80, 2),
    // Syncopated snare (e.g., 2, and of 3, 4)
    { targetTimeMs: getMs(80, 1), drumType: 'snare-head', sticking: 'L', isAccent: true }, // beat 2
    { targetTimeMs: getMs(80, 2.5), drumType: 'snare-head', sticking: 'L', isAccent: true }, // and of 3
    { targetTimeMs: getMs(80, 3), drumType: 'snare-head', sticking: 'L', isAccent: true }, // beat 4
    
    { targetTimeMs: getMs(80, 5), drumType: 'snare-head', sticking: 'L', isAccent: true },
    { targetTimeMs: getMs(80, 6.5), drumType: 'snare-head', sticking: 'L', isAccent: true },
    { targetTimeMs: getMs(80, 7), drumType: 'snare-head', sticking: 'L', isAccent: true },
  ] satisfies DrillNote[]).sort((a, b) => a.targetTimeMs - b.targetTimeMs),
  passCriteria: {
    ...TOLERANCE_BANDS.Consolidating,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 2,
    decouplingScoreThreshold: 0.5,
  },
  failureDiagnostics: [],
};

export const HiHatIndependenceDrill4: ContentUnit = {
  id: 'hh-indep-4',
  name: 'Displacement',
  tier: 'Bootcamp',
  category: 'Hi-Hat Independence',
  bpm: 80,
  sequence: ([
    // Upbeat hi-hat chicks
    { targetTimeMs: getMs(80, 0.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: getMs(80, 1.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: getMs(80, 2.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: getMs(80, 3.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: getMs(80, 4.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: getMs(80, 5.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: getMs(80, 6.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: getMs(80, 7.5), drumType: 'hihat-chick', sticking: '', isAccent: false },
    // Snare backbeat
    ...generateSnareBackbeat(80, 2)
    // `satisfies` restores contextual typing that `.sort()` otherwise strips,
    // so a mistyped drumType is caught here rather than widening to string.
  ] satisfies DrillNote[]).sort((a, b) => a.targetTimeMs - b.targetTimeMs),
  passCriteria: {
    ...TOLERANCE_BANDS.Mastery,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 2,
    decouplingScoreThreshold: 0.45,
  },
  failureDiagnostics: [],
};

export const HiHatIndependenceDrill5: ContentUnit = {
  id: 'hh-indep-5',
  name: 'Graduation Groove',
  tier: 'Bootcamp',
  category: 'Hi-Hat Independence',
  bpm: 80,
  sequence: ([
    ...generateHiHatSequence(80, 2), // Quarter note chicks
    ...generateSnareBackbeat(80, 2),
    // Basic kick pattern (1, 3, and of 3)
    { targetTimeMs: getMs(80, 0), drumType: 'kick', sticking: 'R', isAccent: true },
    { targetTimeMs: getMs(80, 2), drumType: 'kick', sticking: 'R', isAccent: true },
    { targetTimeMs: getMs(80, 2.5), drumType: 'kick', sticking: 'R', isAccent: true },
    { targetTimeMs: getMs(80, 4), drumType: 'kick', sticking: 'R', isAccent: true },
    { targetTimeMs: getMs(80, 6), drumType: 'kick', sticking: 'R', isAccent: true },
    { targetTimeMs: getMs(80, 6.5), drumType: 'kick', sticking: 'R', isAccent: true },
  ] satisfies DrillNote[]).sort((a, b) => a.targetTimeMs - b.targetTimeMs),
  passCriteria: {
    ...TOLERANCE_BANDS.Mastery,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 2,
    decouplingScoreThreshold: 0.4, // r <= 0.4
  },
  failureDiagnostics: [],
};

// -- Helpers --

function getMs(bpm: number, beats: number): number {
  return beats * (60000 / bpm);
}

function generateHiHatSequence(bpm: number, bars: number): DrillNote[] {
  const seq: DrillNote[] = [];
  for (let i = 0; i < bars * 4; i++) {
    seq.push({
      targetTimeMs: getMs(bpm, i),
      drumType: 'hihat-chick',
      sticking: '',
      isAccent: false
    });
  }
  return seq;
}

function generateSnareBackbeat(bpm: number, bars: number): DrillNote[] {
  const seq: DrillNote[] = [];
  for (let i = 0; i < bars; i++) {
    seq.push({ targetTimeMs: getMs(bpm, i * 4 + 1), drumType: 'snare-head', sticking: 'L', isAccent: true }); // beat 2
    seq.push({ targetTimeMs: getMs(bpm, i * 4 + 3), drumType: 'snare-head', sticking: 'L', isAccent: true }); // beat 4
  }
  return seq;
}

/**
 * Validates a drill session run against logical AND gating AND decoupling thresholds.
 */
export function evaluateIndependencePass(
  unit: ContentUnit,
  timingScores: Int8Array,
  decouplingScore: number
): { passed: boolean; message: string } {
  if (timingScores.length === 0) return { passed: false, message: 'No notes played.' };

  let totalValid = 0;
  for (let i = 0; i < timingScores.length; i++) {
    if (timingScores[i] === SCORING_CATEGORIES.GREEN) {
      totalValid++;
    }
  }

  const accuracy = (totalValid / timingScores.length) * 100;
  if (accuracy < unit.passCriteria.timingAccuracyPercent) {
    return { passed: false, message: `Timing accuracy too low (${accuracy.toFixed(1)}%). Need ${unit.passCriteria.timingAccuracyPercent}%.` };
  }

  if (unit.passCriteria.decouplingScoreThreshold !== undefined) {
    if (decouplingScore > unit.passCriteria.decouplingScoreThreshold) {
      return { 
        passed: false, 
        message: 'Your foot is following your hand on the syncopation. Focus on keeping the foot steady and independent.' 
      };
    }
  }

  return { passed: true, message: 'Passed.' };
}
