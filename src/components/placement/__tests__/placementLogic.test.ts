import { describe, it, expect } from 'vitest';
import { MAX_PLACEMENT_DEPTH } from '../../../store/ProgressionStore'
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

  it('never places deeper than MAX_PLACEMENT_DEPTH, at any accuracy', () => {
    // The existing cap test is vacuous: the bands top out at 'consolidating',
    // which IS the cap, so the guard can never fire and deleting it breaks
    // nothing. This sweeps the whole input range instead, so widening a band
    // to 'mastery' — the change the cap exists to survive — fails here.
    const order = ['introduction', 'developing', 'consolidating', 'mastery']
    const maxIndex = order.indexOf(MAX_PLACEMENT_DEPTH)

    for (let percent = 0; percent <= 100; percent += 5) {
      const result = { passed: true, accuracyPercent: percent, dynamicScores: new Int8Array([1, 1, 1, 1]), decouplingScore: undefined } as unknown as DrillResult
      for (const category of ['timing', 'dynamics', 'independence'] as const) {
        const depth = calculatePlacement(category, result)
        expect(order.indexOf(depth as string), `${category} at ${percent}% placed too deep`).toBeLessThanOrEqual(maxIndex)
      }
    }
  })

  it('measures dynamics by dynamics, not by timing', () => {
    // A drummer with excellent time and flat dynamics. accuracyPercent counts
    // GREEN categories only, which is timing — grading dynamics on it placed
    // this drummer at consolidating for a category they had not demonstrated.
    const flatDynamics = {
      passed: true,
      accuracyPercent: 100,
      dynamicScores: new Int8Array([0, 0, 0, 1]),
      decouplingScore: undefined,
    } as unknown as DrillResult

    expect(calculatePlacement('dynamics', flatDynamics)).toBe('introduction')
    // The same result read as timing is still a strong timing performance.
    expect(calculatePlacement('timing', flatDynamics)).toBe('consolidating')
  })

  it('places a drummer with clean dynamics above one without', () => {
    const base = { passed: true, accuracyPercent: 75, decouplingScore: undefined }
    const clean = { ...base, dynamicScores: new Int8Array([1, 1, 1, 1]) } as unknown as DrillResult
    const messy = { ...base, dynamicScores: new Int8Array([1, 0, 0, 0]) } as unknown as DrillResult

    expect(calculatePlacement('dynamics', clean)).toBe('consolidating')
    expect(calculatePlacement('dynamics', messy)).toBe('introduction')
  })

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
