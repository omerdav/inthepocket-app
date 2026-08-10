import { describe, it, expect } from 'vitest';
import { DiagnosticEngine } from '../DiagnosticEngine';
import { DiagnosticRuleId } from '../scoring.types';

describe('DiagnosticEngine', () => {

  it('Zone Confusion Detection: Should emit ZONE_CONFUSION if hitZone !== targetZone', () => {
    // e.g., hit Snare Head (38) when Snare Rim (40) was expected
    const rule = DiagnosticEngine.evaluate(
      0,   // offset
      80,  // hit velocity
      50,  // min V
      100, // max V
      38,  // hit zone (Snare Head)
      40,  // target zone (Snare Rim)
      50   // green window
    );
    expect(rule).toBe(DiagnosticRuleId.ZONE_CONFUSION);
  });

  it('Failure Diagnostic Output: Should emit GHOST_TOO_LOUD if velocity > max', () => {
    const rule = DiagnosticEngine.evaluate(
      5,   // offset
      80,  // hit velocity (Too loud for ghost note)
      15,  // target min (Ghost)
      35,  // target max (Ghost)
      38,  // hit zone
      38,  // target zone
      50
    );
    expect(rule).toBe(DiagnosticRuleId.GHOST_TOO_LOUD);
  });

  it('Failure Diagnostic Output: Should emit ACCENT_TOO_SOFT if velocity < min', () => {
    const rule = DiagnosticEngine.evaluate(
      0,   // offset
      50,  // hit velocity
      90,  // target min (Accent)
      127, // target max (Accent)
      38,  // hit zone
      38,  // target zone
      50
    );
    expect(rule).toBe(DiagnosticRuleId.ACCENT_TOO_SOFT);
  });

  it('Timing Diagnostic: Should emit RUSHING if offset is earlier than the derived threshold', () => {
    // Introduction band is 50ms. Threshold = 50 * 0.6 = 30ms.
    const rule = DiagnosticEngine.evaluate(
      -45, // offset (early)
      100, // hit velocity
      90,
      127,
      38,
      38,
      50
    );
    expect(rule).toBe(DiagnosticRuleId.RUSHING);
  });

  it('Timing Diagnostic: Should emit DRAGGING if offset is later than the derived threshold', () => {
    // Introduction band is 50ms. Threshold = 50 * 0.6 = 30ms.
    const rule = DiagnosticEngine.evaluate(
      45,  // offset (late)
      100, // hit velocity
      90,
      127,
      38,
      38,
      50
    );
    expect(rule).toBe(DiagnosticRuleId.DRAGGING);
  });

  it('Perfect Hit: Should emit OK if everything matches', () => {
    const rule = DiagnosticEngine.evaluate(
      5,   // offset
      100, // hit velocity
      90,
      127,
      38,
      38,
      50
    );
    expect(rule).toBe(DiagnosticRuleId.OK);
  });

  it('Timing Diagnostic: Scales with the drill band (same offset is silent on Introduction, flagged on Mastery)', () => {
    // Introduction band is 50ms. Threshold = 50 * 0.6 = 30ms. -25 is within threshold.
    const introRule = DiagnosticEngine.evaluate(-25, 100, 90, 127, 38, 38, 50);
    expect(introRule).toBe(DiagnosticRuleId.OK);

    // Mastery band is 30ms. Threshold = 30 * 0.6 = 18ms. -25 is beyond threshold (early).
    const masteryRule = DiagnosticEngine.evaluate(-25, 100, 90, 127, 38, 38, 30);
    expect(masteryRule).toBe(DiagnosticRuleId.RUSHING);
  });

});
