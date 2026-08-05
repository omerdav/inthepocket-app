export const SCORING_CATEGORIES = {
  GREEN: 0,
  YELLOW: 1,
  RED: 2,
  MISS: 3
} as const;

export type ScoringCategory = typeof SCORING_CATEGORIES[keyof typeof SCORING_CATEGORIES];

/**
 * A const object rather than an `enum`: the project sets `erasableSyntaxOnly`,
 * under which `enum` is not permitted (it emits runtime code). Usage sites are
 * unchanged — `DiagnosticRuleId.OK` still works — and this matches the shape
 * already used by SCORING_CATEGORIES above.
 */
export const DiagnosticRuleId = {
  OK: 0,
  RUSHING: 1,
  DRAGGING: 2,
  GHOST_TOO_LOUD: 3,
  ACCENT_TOO_SOFT: 4,
  ZONE_CONFUSION: 5,
} as const;

export type DiagnosticRuleId = typeof DiagnosticRuleId[keyof typeof DiagnosticRuleId];

export interface ScoringWorkerInitMessage {
  type: 'init';
  bufferSize: number;
}

export interface ScoringWorkerCalculateMessage {
  type: 'calculate';
  targetBeats: Float64Array; // Timestamps of target beats
  targetVelocityMin: Float32Array; // Min allowed velocity per target
  targetVelocityMax: Float32Array; // Max allowed velocity per target
  targetZones: Int8Array; // Expected drum zone (MIDI note number) per target
  hitTimestamps: Float64Array; // Timestamps of user hits
  hitVelocities: Float32Array; // Velocities of user hits
  hitZones: Int8Array; // Drum zone (MIDI note number) of user hits
  numTargets: number;
  numHits: number;
  /**
   * GREEN threshold in ms, from the drill's PassCriteria. YELLOW extends to
   * 1.67x this. Defaults to 30 (and therefore 50 for YELLOW), preserving the
   * previous hardcoded behaviour.
   *
   * Without this the adaptive tolerance bands could not be applied: every
   * drill was graded at 30/50ms regardless of what its criteria said.
   */
  timingWindowMs?: number;
}

/** YELLOW band as a multiple of the GREEN window. */
export const YELLOW_WINDOW_RATIO = 5 / 3;

export interface ScoringWorkerResultMessage {
  type: 'result';
  offsets: Float32Array; // Delta offset in ms for each target beat
  categories: Int8Array; // Category for each target beat
  dynamicScores: Int8Array; // 1 for PASS, 0 for FAIL
  diagnosticRuleIds: Uint8Array; // Maps to DiagnosticRuleId enum
  struckZones: Int8Array; // The MIDI note actually struck for each target, or -1 for MISS
  numResults: number;    // Equals numTargets
  decouplingScore?: number; // Pearson r score between hand and foot
}

export type ScoringWorkerMessage = ScoringWorkerInitMessage | ScoringWorkerCalculateMessage;
