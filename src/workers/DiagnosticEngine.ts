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
    targetZone: number
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
    // If it's a MISS or RED, it's a severe timing issue
    if (offsetMs < -30) {
      return DiagnosticRuleId.RUSHING;
    }
    if (offsetMs > 30) {
      return DiagnosticRuleId.DRAGGING;
    }

    // 4. Perfect
    return DiagnosticRuleId.OK;
  }
}
