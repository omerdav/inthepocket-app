import { describe, it, expect } from 'vitest';
import { calculatePlacement } from '../placementLogic';
import type { DrillResult } from '../../../session/DrillRunner';

describe('placementLogic', () => {
  it('assigns different depths based on performance profiles', () => {
    const beginnerResult: DrillResult = {
      unitId: 'test',
      passed: true,
      accuracyPercent: 60,
      diagnosis: { headline: '', detail: '', beats: [] },
      numTargets: 10,
      numHits: 10,
      categories: new Int8Array(),
      offsets: new Float32Array(),
      dynamicScores: new Int8Array(),
      diagnosticRuleIds: new Uint8Array(),
      struckZones: new Int8Array()
    };

    const advancedResult: DrillResult = {
      ...beginnerResult,
      accuracyPercent: 95
    };

    const beginnerDepth = calculatePlacement('timing', beginnerResult);
    const advancedDepth = calculatePlacement('timing', advancedResult);

    expect(beginnerDepth).not.toBe(advancedDepth);
    expect(beginnerDepth).toBe('introduction');
    expect(advancedDepth).toBe('consolidating');
  });

  it('caps placement at consolidating', () => {
    const perfectResult: DrillResult = {
      unitId: 'test',
      passed: true,
      accuracyPercent: 100,
      diagnosis: { headline: '', detail: '', beats: [] },
      numTargets: 10,
      numHits: 10,
      categories: new Int8Array(),
      offsets: new Float32Array(),
      dynamicScores: new Int8Array(),
      diagnosticRuleIds: new Uint8Array(),
      struckZones: new Int8Array()
    };

    const depth = calculatePlacement('timing', perfectResult);
    expect(depth).toBe('consolidating'); // MAX_PLACEMENT_DEPTH
  });

  it('places failed drills at introduction', () => {
    const failedResult: DrillResult = {
      unitId: 'test',
      passed: false,
      accuracyPercent: 100, // Even if accuracy is high, pass=false overrides
      diagnosis: { headline: '', detail: '', beats: [] },
      numTargets: 10,
      numHits: 10,
      categories: new Int8Array(),
      offsets: new Float32Array(),
      dynamicScores: new Int8Array(),
      diagnosticRuleIds: new Uint8Array(),
      struckZones: new Int8Array()
    };

    const depth = calculatePlacement('timing', failedResult);
    expect(depth).toBe('introduction');
  });

  it('returns null when drill is cancelled (skipped)', () => {
    const cancelledResult: DrillResult = {
      unitId: 'test',
      passed: false,
      accuracyPercent: 0,
      diagnosis: { headline: '', detail: '', beats: [] },
      numTargets: 10,
      numHits: 0,
      categories: new Int8Array(),
      offsets: new Float32Array(),
      dynamicScores: new Int8Array(),
      diagnosticRuleIds: new Uint8Array(),
      struckZones: new Int8Array(),
      error: 'cancelled'
    };

    const depth = calculatePlacement('timing', cancelledResult);
    expect(depth).toBeNull();
  });
});
