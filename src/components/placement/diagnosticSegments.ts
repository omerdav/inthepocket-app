import type { ContentUnit } from '../../data/types';

export const SegmentTiming: ContentUnit = {
  id: 'diagnostic-timing',
  name: 'Placement: Timing',
  tier: 'Diagnostic',
  category: 'timing',
  bpm: 80,
  sequence: [
    { targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: false },
    { targetTimeMs: 375, drumType: 'snare-head', sticking: 'L', isAccent: false },
    { targetTimeMs: 750, drumType: 'snare-head', sticking: 'R', isAccent: false },
    { targetTimeMs: 1125, drumType: 'snare-head', sticking: 'L', isAccent: false },
  ],
  passCriteria: {
    timingWindowMs: 60,
    timingAccuracyPercent: 80,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 1,
  },
  failureDiagnostics: [],
};

export const SegmentDynamics: ContentUnit = {
  id: 'diagnostic-dynamics',
  name: 'Placement: Dynamics',
  tier: 'Diagnostic',
  category: 'dynamics',
  bpm: 80,
  sequence: [
    { targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: true, velocityRange: { min: 100, max: 127 } },
    { targetTimeMs: 375, drumType: 'snare-head', sticking: 'L', isAccent: false, velocityRange: { min: 0, max: 50 } },
    { targetTimeMs: 750, drumType: 'snare-head', sticking: 'R', isAccent: true, velocityRange: { min: 100, max: 127 } },
    { targetTimeMs: 1125, drumType: 'snare-head', sticking: 'L', isAccent: false, velocityRange: { min: 0, max: 50 } },
  ],
  passCriteria: {
    timingWindowMs: 80,
    timingAccuracyPercent: 80,
    dynamicContrastDb: 10,
    consecutiveBarsRequired: 1,
  },
  failureDiagnostics: [],
};

export const SegmentIndependence: ContentUnit = {
  id: 'diagnostic-independence',
  name: 'Placement: Independence',
  tier: 'Diagnostic',
  category: 'independence',
  bpm: 80,
  sequence: [
    { targetTimeMs: 0, drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: 375, drumType: 'snare-head', sticking: 'R', isAccent: false },
    { targetTimeMs: 750, drumType: 'hihat-chick', sticking: '', isAccent: false },
    { targetTimeMs: 1125, drumType: 'snare-head', sticking: 'L', isAccent: false },
  ],
  passCriteria: {
    timingWindowMs: 80,
    timingAccuracyPercent: 80,
    dynamicContrastDb: 0,
    consecutiveBarsRequired: 1,
    decouplingScoreThreshold: 0.5,
  },
  failureDiagnostics: [],
};

export const DIAGNOSTIC_SEGMENTS = [SegmentTiming, SegmentDynamics, SegmentIndependence];
