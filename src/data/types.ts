export type DrumType = 
  | 'snare-head' 
  | 'snare-rim' 
  | 'kick' 
  | 'hihat-open' 
  | 'hihat-closed' 
  | 'hihat-chick';

export interface DiagnosticRule {
  condition: string;
  limb: string;
  zone: string;
  message: string;
}

export interface PassCriteria {
  timingWindowMs: number;
  timingAccuracyPercent: number;
  dynamicContrastDb: number;
  consecutiveBarsRequired: number;
  decouplingScoreThreshold?: number; // e.g. 0.4 meaning Pearson r must be <= 0.4
}

export interface DrillNote {
  targetTimeMs: number;
  drumType: DrumType;
  sticking: 'R' | 'L' | '';
  isAccent: boolean;
  velocityRange?: { min: number; max: number };
}

export interface ContentUnit {
  id: string;
  name: string;
  tier: string;
  category: string;
  bpm: number;
  sequence: DrillNote[];
  passCriteria: PassCriteria;
  failureDiagnostics: DiagnosticRule[];
  /**
   * For the MVP, we use programmatic playback from the `sequence` DrillNote[] array.
   * If recorded audio is needed in the future, populate this field.
   */
  audioCapturePath?: string;
}
