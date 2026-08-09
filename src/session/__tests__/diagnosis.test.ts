import { describe, it, expect } from 'vitest';
import { diagnose } from '../diagnosis';
import { DiagnosticRuleId, SCORING_CATEGORIES } from '../../workers/scoring.types';
import type { ContentUnit } from '../../data/types';
import { VELOCITY_RANGES } from '../../data/utils';

describe('diagnose', () => {
  const dummyUnit: ContentUnit = {
    id: 'test-unit',
    name: 'Test',
    tier: 'T1',
    category: 'tech',
    failureDiagnostics: [],
    bpm: 120,
    sequence: [],
    passCriteria: { timingWindowMs: 50, timingAccuracyPercent: 80, dynamicContrastDb: 10, consecutiveBarsRequired: 1 }
  };

  it('R-T1: diagnoses "inconsistent" for high spread, low bias (sigma 45ms, bias 0)', () => {
    const numResults = 20;
    const categories = new Int8Array(numResults).fill(SCORING_CATEGORIES.YELLOW);
    const rules = new Uint8Array(numResults).fill(DiagnosticRuleId.RUSHING);
    // 10 rushed, 10 dragged, spread is high, mean is 0
    const offsets = new Float32Array(numResults);
    for (let i = 0; i < numResults; i++) {
      offsets[i] = i % 2 === 0 ? 45 : -45; // stddev will be 45, mean 0
    }
    const unit = { ...dummyUnit, sequence: Array.from({length: numResults}, (_, i) => ({
      targetTimeMs: i * 500, drumType: 'snare-head', sticking: 'R', isAccent: false
    })) };

    const result = diagnose(unit as any, categories, rules, offsets, numResults);
    expect(result.headline).toBe("You're inconsistent.");
  });

  it('R-T1.5: F-5 boundary test: exactly at the spread threshold (sigma 30ms, bias 0) does not diagnose inconsistent', () => {
    const numResults = 20;
    const categories = new Int8Array(numResults).fill(SCORING_CATEGORIES.YELLOW);
    const rules = new Uint8Array(numResults).fill(DiagnosticRuleId.RUSHING);
    const offsets = new Float32Array(numResults);
    for (let i = 0; i < numResults; i++) {
      offsets[i] = i % 2 === 0 ? 30 : -30; // stddev will be 30, mean 0
    }
    const unit = { ...dummyUnit, sequence: Array.from({length: numResults}, (_, i) => ({
      targetTimeMs: i * 500, drumType: 'snare-head', sticking: 'R', isAccent: false
    })) };

    const result = diagnose(unit as any, categories, rules, offsets, numResults);
    // Because it's exactly 30, it should NOT trigger the inconsistency check (which requires > 30),
    // and thus it should fall back to the topRule which is RUSHING.
    expect(result.headline).toMatch(/rushing/i);
  });

  it('R-T2: diagnoses "rushing" for consistent directional bias (sigma 14ms, bias -35ms)', () => {
    const numResults = 20;
    const categories = new Int8Array(numResults).fill(SCORING_CATEGORIES.YELLOW);
    const rules = new Uint8Array(numResults).fill(DiagnosticRuleId.RUSHING);
    const offsets = new Float32Array(numResults);
    for (let i = 0; i < numResults; i++) {
      offsets[i] = -35 + (i % 2 === 0 ? 14 : -14); // mean -35, stddev 14
    }
    const unit = { ...dummyUnit, sequence: Array.from({length: numResults}, (_, i) => ({
      targetTimeMs: i * 500, drumType: 'snare-head', sticking: 'R', isAccent: false
    })) };

    const result = diagnose(unit as any, categories, rules, offsets, numResults);
    expect(result.headline).toMatch(/rushing/i);
  });

  it('R-T3: GHOST_TOO_LOUD on a normal-band note does not contain "ghost"', () => {
    const numResults = 1;
    const categories = new Int8Array([SCORING_CATEGORIES.YELLOW]);
    const rules = new Uint8Array([DiagnosticRuleId.GHOST_TOO_LOUD]);
    const offsets = new Float32Array([0]);
    const unit = { ...dummyUnit, sequence: [{
      targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: false, velocityRange: VELOCITY_RANGES.NORMAL
    }] };

    const result = diagnose(unit as any, categories, rules, offsets, numResults);
    expect(result.headline).not.toMatch(/ghost/i);
  });

  it('R-T4: GHOST_TOO_LOUD on a ghost-band note contains "ghost"', () => {
    const numResults = 1;
    const categories = new Int8Array([SCORING_CATEGORIES.YELLOW]);
    const rules = new Uint8Array([DiagnosticRuleId.GHOST_TOO_LOUD]);
    const offsets = new Float32Array([0]);
    const unit = { ...dummyUnit, sequence: [{
      targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: false, velocityRange: VELOCITY_RANGES.GHOST
    }] };

    const result = diagnose(unit as any, categories, rules, offsets, numResults);
    expect(result.headline).toMatch(/ghost/i);
  });

  describe('ZONE_CONFUSION', () => {
    it('R-T1: keeps the cross-stick guidance for head-instead-of-rim', () => {
      const numResults = 1;
      const categories = new Int8Array([SCORING_CATEGORIES.RED]);
      const rules = new Uint8Array([DiagnosticRuleId.ZONE_CONFUSION]);
      const offsets = new Float32Array([0]);
      const struckZones = new Int8Array([38]); // snare-head
      const unit = { ...dummyUnit, sequence: [{
        targetTimeMs: 0, drumType: 'snare-rim', sticking: 'R', isAccent: false
      }] };

      const result = diagnose(unit as any, categories, rules, offsets, numResults, struckZones);
      expect(result.headline).toBe("On beat 1 you hit the head instead of the rim — soft isn't the same as cross-stick.");
      expect(result.headline).toMatch(/cross-stick/);
    });

    it('R-T1/R-T2: names the pedal for closed hi-hat struck where chick expected, never cross-stick', () => {
      const numResults = 1;
      const categories = new Int8Array([SCORING_CATEGORIES.RED]);
      const rules = new Uint8Array([DiagnosticRuleId.ZONE_CONFUSION]);
      const offsets = new Float32Array([0]);
      const struckZones = new Int8Array([42]); // hihat-closed
      const unit = { ...dummyUnit, sequence: [{
        targetTimeMs: 0, drumType: 'hihat-chick', sticking: '', isAccent: false
      }] };

      const result = diagnose(unit as any, categories, rules, offsets, numResults, struckZones);
      expect(result.headline).toBe("On beat 1 you hit the closed hi-hat instead of the hi-hat pedal.");
      expect(result.headline).not.toMatch(/cross-stick/);
    });

    it('R-T1: kick struck where snare expected', () => {
      const numResults = 1;
      const categories = new Int8Array([SCORING_CATEGORIES.RED]);
      const rules = new Uint8Array([DiagnosticRuleId.ZONE_CONFUSION]);
      const offsets = new Float32Array([0]);
      const struckZones = new Int8Array([36]); // kick
      const unit = { ...dummyUnit, sequence: [{
        targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: false
      }] };

      const result = diagnose(unit as any, categories, rules, offsets, numResults, struckZones);
      expect(result.headline).toBe("On beat 1 you hit the kick instead of the head.");
    });

    it('R-T1: unrecognised pair gives general fallback', () => {
      const numResults = 1;
      const categories = new Int8Array([SCORING_CATEGORIES.RED]);
      const rules = new Uint8Array([DiagnosticRuleId.ZONE_CONFUSION]);
      const offsets = new Float32Array([0]);
      const struckZones = new Int8Array([99]); // Unknown
      const unit = { ...dummyUnit, sequence: [{
        targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: false
      }] };

      const result = diagnose(unit as any, categories, rules, offsets, numResults, struckZones);
      expect(result.headline).toBe("On beat 1 you hit the wrong drum zone.");
    });

    it('F-2: reports only the beats matching the named pair when multiple confusions exist', () => {
      const numResults = 2;
      const categories = new Int8Array([SCORING_CATEGORIES.RED, SCORING_CATEGORIES.RED]);
      const rules = new Uint8Array([DiagnosticRuleId.ZONE_CONFUSION, DiagnosticRuleId.ZONE_CONFUSION]);
      const offsets = new Float32Array([0, 0]);
      // beat 1: expected snare-head, struck kick
      // beat 3 (time 1000 at 120bpm = beat 3): expected hihat-chick, struck hihat-closed
      const struckZones = new Int8Array([36, 42]); // kick, closed
      const unit = { ...dummyUnit, sequence: [
        { targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: false },
        { targetTimeMs: 1000, drumType: 'hihat-chick', sticking: '', isAccent: false }
      ] };

      const result = diagnose(unit as any, categories, rules, offsets, numResults, struckZones);
      // The first pair is snare-head -> kick. It should ONLY report beat 1.
      expect(result.headline).toBe("On beat 1 you hit the kick instead of the head.");
    });
  });
});
