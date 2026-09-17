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
  /**
   * There is deliberately no `dynamicContrastDb` here (register P-21).
   *
   * Every drill used to declare one — 10 or 15 — and nothing ever read it, so
   * a reader of the content files would reasonably conclude drill 3 enforced
   * 15 dB of contrast. Nothing did. It could not be honoured as written
   * either: decibels describe the sound the module makes, and all the app
   * receives is a 7-bit velocity whose relationship to loudness is set by a
   * user-configurable curve it cannot see. Measuring dB needs a microphone.
   *
   * The intent it stood for — accent and ghost must be distinguishable — is
   * carried by `dynamicsCalibration.ts`, in the unit actually available:
   * velocity separation measured on this drummer's own kit.
   */
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
