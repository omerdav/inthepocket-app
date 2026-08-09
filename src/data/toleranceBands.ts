export const TOLERANCE_BANDS = {
  Introduction: { timingWindowMs: 50, timingAccuracyPercent: 70 },
  Developing: { timingWindowMs: 40, timingAccuracyPercent: 75 },
  Consolidating: { timingWindowMs: 35, timingAccuracyPercent: 80 },
  Mastery: { timingWindowMs: 30, timingAccuracyPercent: 85 },
} as const;
