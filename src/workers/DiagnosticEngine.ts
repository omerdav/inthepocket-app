import { DiagnosticRuleId } from './scoring.types';

export class DiagnosticEngine {
  /**
   * Zero-allocation diagnostic evaluator.
   * Evaluates a single hit against its target and returns the appropriate rule ID.
   */
  static evaluate(
    offsetMs: number,
    hitVelocity: number,
    targetVelocityMin: number,
    targetVelocityMax: number,
    hitZone: number,
    targetZone: number,
    greenWindow: number
  ): DiagnosticRuleId {
    
    // 1. Zone Confusion Priority
    if (hitZone !== targetZone) {
      return DiagnosticRuleId.ZONE_CONFUSION;
    }

    // 2. Dynamics Priority
    if (hitVelocity < targetVelocityMin) {
      return DiagnosticRuleId.ACCENT_TOO_SOFT;
    }
    if (hitVelocity > targetVelocityMax) {
      return DiagnosticRuleId.GHOST_TOO_LOUD;
    }

    // 3. Timing Priority
    // Coaching threshold is derived from the drill's green window.
    // A ratio of 0.6 lands the Introduction band (±50ms) exactly on the legacy 30ms behavior.
    const COACHING_THRESHOLD_RATIO = 0.6;
    const thresholdMs = greenWindow * COACHING_THRESHOLD_RATIO;

    // If it's a MISS or RED, it's a severe timing issue
    if (offsetMs < -thresholdMs) {
      return DiagnosticRuleId.RUSHING;
    }
    if (offsetMs > thresholdMs) {
      return DiagnosticRuleId.DRAGGING;
    }

    // 4. Perfect
    return DiagnosticRuleId.OK;
  }
}
