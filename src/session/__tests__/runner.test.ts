/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrillRunner } from '../DrillRunner';
import type { ContentUnit } from '../../data/types';
import { SCORING_CATEGORIES } from '../../workers/scoring.types';

vi.mock('../../audio/AudioEngine', () => ({
  audioEngine: {
    unlock: vi.fn().mockResolvedValue(true),
    start: vi.fn(),
    stop: vi.fn(),
    view: new BigInt64Array(10), // mock SAB view
    correlator: { mapHitTime: vi.fn().mockReturnValue(0) },
    context: { currentTime: 0 }
  }
}));

vi.mock('../../audio/midi', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    midiEngine: {
      onHit: vi.fn().mockReturnValue(vi.fn()), // mock unsubscribe
      setDrillActive: vi.fn()
    }
  };
});

describe('DrillRunner Evaluator Dispatch', () => {

  beforeEach(() => {
    // Make sure we pass _awaitFirstBeat and _sleepUntilAudioTime without hanging
    vi.spyOn(DrillRunner.prototype as any, '_awaitFirstBeat').mockResolvedValue(1);
    vi.spyOn(DrillRunner.prototype as any, '_sleepUntilAudioTime').mockResolvedValue(undefined);
  });

  it('R-T1: Independence drill with high decoupling score fails', async () => {
    // We will simulate a run of a drill with decouplingScoreThreshold
    const unit: ContentUnit = {
      id: 'test-indep-fail',
      name: 'Test',
      tier: 'Bootcamp',
      category: 'Hi-Hat Independence',
      bpm: 80,
      sequence: [{ targetTimeMs: 0, drumType: 'kick', sticking: '', isAccent: false }],
      passCriteria: {
        timingWindowMs: 30,
        timingAccuracyPercent: 90,
        dynamicContrastDb: 0,
        consecutiveBarsRequired: 1,
        decouplingScoreThreshold: 0.5
      },
      failureDiagnostics: []
    };

    const workerMock = {
      postMessage: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        if (event === 'message') {
          // Immediately send back a perfect result but high decoupling
          setTimeout(() => {
            handler({
              data: {
                type: 'result',
                offsets: new Float32Array([0]),
                categories: new Int8Array([SCORING_CATEGORIES.GREEN]),
                dynamicScores: new Int8Array([1]),
                diagnosticRuleIds: new Uint8Array([0]),
                struckZones: new Int8Array([36]),
                numResults: 1,
                decouplingScore: 0.8 // 0.8 > 0.5 (threshold) -> FAIL
              }
            } as any);
          }, 0);
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as Worker;

    const runner = new DrillRunner(workerMock);
    const result = await runner.run(unit);

    expect(result.passed).toBe(false);
    expect(result.diagnosis.headline).toContain('foot is following your hand');
  });

  it('R-T2: Independence drill with low decoupling score passes', async () => {
    const unit: ContentUnit = {
      id: 'test-indep-pass',
      name: 'Test',
      tier: 'Bootcamp',
      category: 'Hi-Hat Independence',
      bpm: 80,
      sequence: [{ targetTimeMs: 0, drumType: 'kick', sticking: '', isAccent: false }],
      passCriteria: {
        timingWindowMs: 30,
        timingAccuracyPercent: 90,
        dynamicContrastDb: 0,
        consecutiveBarsRequired: 1,
        decouplingScoreThreshold: 0.5
      },
      failureDiagnostics: []
    };

    const workerMock = {
      postMessage: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({
              data: {
                type: 'result',
                offsets: new Float32Array([0]),
                categories: new Int8Array([SCORING_CATEGORIES.GREEN]),
                dynamicScores: new Int8Array([1]),
                diagnosticRuleIds: new Uint8Array([0]),
                struckZones: new Int8Array([36]),
                numResults: 1,
                decouplingScore: 0.2 // 0.2 < 0.5 (threshold) -> PASS
              }
            } as any);
          }, 0);
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as Worker;

    const runner = new DrillRunner(workerMock);
    const result = await runner.run(unit);

    expect(result.passed).toBe(true);
  });

  it('R-T3: Dynamics Gate drill remains unaffected', async () => {
    // No decouplingScoreThreshold
    const unit: ContentUnit = {
      id: 'test-dynamics',
      name: 'Test',
      tier: 'Bootcamp',
      category: 'Dynamics Gate',
      bpm: 80,
      sequence: [{ targetTimeMs: 0, drumType: 'kick', sticking: '', isAccent: false }],
      passCriteria: {
        timingWindowMs: 30,
        timingAccuracyPercent: 90,
        dynamicContrastDb: 0,
        consecutiveBarsRequired: 1,
      },
      failureDiagnostics: []
    };

    const workerMock = {
      postMessage: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({
              data: {
                type: 'result',
                offsets: new Float32Array([0]),
                categories: new Int8Array([SCORING_CATEGORIES.GREEN]),
                dynamicScores: new Int8Array([1]),
                diagnosticRuleIds: new Uint8Array([0]),
                struckZones: new Int8Array([38]),
                numResults: 1,
                decouplingScore: 0.8 // High but should be ignored!
              }
            } as any);
          }, 0);
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as Worker;

    const runner = new DrillRunner(workerMock);
    const result = await runner.run(unit);

    // Should pass since evaluateDrillPass doesn't care about decouplingScore
    expect(result.passed).toBe(true);
    // Headline should be "In the pocket."
    expect(result.diagnosis.headline).toBe('In the pocket.');
  });
});
