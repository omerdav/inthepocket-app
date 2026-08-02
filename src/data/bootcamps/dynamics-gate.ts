import type { ContentUnit } from '../types';
import { generateSequence } from '../utils';

// Drill 1: Even single strokes on snare head only.
export const DynamicsGateDrill1: ContentUnit = {
  id: 'dynamics-gate-drill-1',
  name: 'Even Single Strokes',
  tier: 'Bootcamp',
  category: 'Dynamics Gate',
  bpm: 80,
  sequence: generateSequence(80, ['R', 'L'], 2, 'snare-head'),
  passCriteria: {
    timingWindowMs: 50,
    timingAccuracyPercent: 90,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 2,
  },
  failureDiagnostics: [],
};

// Drill 2: Accent on beat 1, medium on beats 2-3-4.
// For MVP, generateSequence just sets isAccent on beat 1 automatically.
export const DynamicsGateDrill2: ContentUnit = {
  id: 'dynamics-gate-drill-2',
  name: 'Downbeat Accents',
  tier: 'Bootcamp',
  category: 'Dynamics Gate',
  bpm: 80,
  sequence: generateSequence(80, ['R', 'L'], 2, 'snare-head'),
  passCriteria: {
    timingWindowMs: 45,
    timingAccuracyPercent: 90,
    dynamicContrastDb: 10,
    consecutiveBarsRequired: 2,
  },
  failureDiagnostics: [],
};

// Drill 3: Ghost notes on the head, accents on the head.
// We can manually tweak the sequence or assume generateSequence covers it with VELOCITY_RANGES.GHOST.
// For the sake of data, let's map it.
export const DynamicsGateDrill3: ContentUnit = {
  id: 'dynamics-gate-drill-3',
  name: 'Ghost Note Control',
  tier: 'Bootcamp',
  category: 'Dynamics Gate',
  bpm: 80,
  sequence: generateSequence(80, ['R', 'L'], 2, 'snare-head').map(note => ({
    ...note,
    // Accent on 1, everything else is ghost
    velocityRange: note.isAccent ? { min: 90, max: 127 } : { min: 15, max: 35 }
  })),
  passCriteria: {
    timingWindowMs: 40,
    timingAccuracyPercent: 90,
    dynamicContrastDb: 15,
    consecutiveBarsRequired: 2,
  },
  failureDiagnostics: [],
};

// Drill 4: Cross-stick on the rim.
export const DynamicsGateDrill4: ContentUnit = {
  id: 'dynamics-gate-drill-4',
  name: 'Cross-Stick Technique',
  tier: 'Bootcamp',
  category: 'Dynamics Gate',
  bpm: 80,
  sequence: generateSequence(80, ['R'], 2, 'snare-rim'),
  passCriteria: {
    timingWindowMs: 38,
    timingAccuracyPercent: 90,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 2,
  },
  failureDiagnostics: [],
};

// Drill 5 (Graduation Drill): Full groove combining accents, ghost notes on the head, and rim technique.
export const DynamicsGateDrill5: ContentUnit = {
  id: 'dynamics-gate-drill-5',
  name: 'Dynamics Gate Graduation',
  tier: 'Bootcamp',
  category: 'Dynamics Gate',
  bpm: 90,
  sequence: [
    { targetTimeMs: 0, drumType: 'kick', sticking: 'R', isAccent: true, velocityRange: { min: 90, max: 127 } },
    { targetTimeMs: 250, drumType: 'snare-head', sticking: 'L', isAccent: false, velocityRange: { min: 15, max: 35 } },
    { targetTimeMs: 500, drumType: 'snare-rim', sticking: 'R', isAccent: true, velocityRange: { min: 90, max: 127 } },
    { targetTimeMs: 750, drumType: 'snare-head', sticking: 'L', isAccent: false, velocityRange: { min: 15, max: 35 } },
  ],
  passCriteria: {
    timingWindowMs: 35, // Tightens to 35ms
    timingAccuracyPercent: 95,
    dynamicContrastDb: 15,
    consecutiveBarsRequired: 1,
  },
  failureDiagnostics: [],
};

/**
 * Validates a drill session run against strict logical AND gating.
 * Drill 5 specifically requires (Timing && Dynamics && Zone).
 */
export function evaluateDrillPass(
  unit: ContentUnit,
  timingScores: Int8Array,
  dynamicScores: Int8Array,
  diagnosticRuleIds: Uint8Array
): boolean {
  // If no notes, fail.
  if (timingScores.length === 0) return false;

  let totalValid = 0;
  for (let i = 0; i < timingScores.length; i++) {
    const isTimingValid = timingScores[i] === 0 || timingScores[i] === 1; // GREEN or YELLOW
    const isDynamicValid = dynamicScores[i] === 1; // PASS
    const isZoneValid = diagnosticRuleIds[i] !== 5; // Not ZONE_CONFUSION

    // Strict Logical AND for every note
    if (isTimingValid && isDynamicValid && isZoneValid) {
      totalValid++;
    }
  }

  const accuracy = (totalValid / timingScores.length) * 100;
  return accuracy >= unit.passCriteria.timingAccuracyPercent;
}
