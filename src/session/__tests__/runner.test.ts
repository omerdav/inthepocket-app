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

  it('R-T4: A correct chick performance produces no dynamics fault', async () => {
    const unit: ContentUnit = {
      id: 'hh-indep-1-test',
      name: 'Test',
      tier: 'Bootcamp',
      category: 'Hi-Hat Independence',
      bpm: 80,
      sequence: [{ targetTimeMs: 0, drumType: 'hihat-chick', sticking: '', isAccent: false }],
      passCriteria: {
        timingWindowMs: 30,
        timingAccuracyPercent: 90,
        dynamicContrastDb: 0,
        consecutiveBarsRequired: 1,
      },
      failureDiagnostics: []
    };

    const workerMock = {
      postMessage: vi.fn((msg) => {
        // Mock worker logic: if the target velocity range doesn't allow 100, fail it.
        const targetMin = msg.targetVelocityMin[0];
        const targetMax = msg.targetVelocityMax[0];
        const hitVelocity = 100; // Simulated chick velocity
        
        let dynamicScore = 1; // 1 = ok
        if (hitVelocity < targetMin) dynamicScore = -1; // too soft
        if (hitVelocity > targetMax) dynamicScore = 2; // too loud

        const resultHandler = (workerMock.addEventListener as any).mock.calls.find((c: any) => c[0] === 'message')[1];
        setTimeout(() => {
          resultHandler({
            data: {
              type: 'result',
              offsets: new Float32Array([0]),
              categories: new Int8Array([SCORING_CATEGORIES.GREEN]),
              dynamicScores: new Int8Array([dynamicScore]),
              diagnosticRuleIds: new Uint8Array([0]),
              struckZones: new Int8Array([44]), // hihat chick
              numResults: 1,
            }
          } as any);
        }, 0);
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Worker;

    const runner = new DrillRunner(workerMock);
    const result = await runner.run(unit);

    expect(result.diagnosis.headline).not.toContain('dynamics are uneven');
    expect(result.diagnosis.headline).not.toContain('hitting harder');
    expect(result.passed).toBe(true);
  });
  
  it('R-T3: Collection window extends to the latest note, not the last array element', async () => {
    // Construct a sequence whose LAST ELEMENT IS EARLIER THAN ITS MAXIMUM.
    const unit: ContentUnit = {
      id: 'test-window',
      name: 'Test Window',
      tier: 'Bootcamp',
      category: 'Dynamics Gate',
      bpm: 80, // period = 0.75s
      // The latest note is at 1000ms, but the last element is at 500ms.
      sequence: [
        { targetTimeMs: 0, drumType: 'kick', sticking: '', isAccent: false },
        { targetTimeMs: 1000, drumType: 'kick', sticking: '', isAccent: false }, // Maximum
        { targetTimeMs: 500, drumType: 'kick', sticking: '', isAccent: false }    // Last element
      ],
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
              }
            } as any);
          }, 0);
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as Worker;

    const runner = new DrillRunner(workerMock);
    
    // spy is active in beforeEach
    const sleepSpy = (DrillRunner.prototype as any)._sleepUntilAudioTime;
    
    await runner.run(unit);

    // periodSec = 60 / 80 = 0.75
    // COUNT_IN_BEATS = 4
    // firstBeatSec is mocked to 1 in beforeEach
    // drillStartSec = 1 + 4 * 0.75 = 4
    // TAIL_MS = 400
    // If correct: lastNoteMs = 1000 -> endSec = 4 + 1.4 = 5.4
    // If buggy: lastNoteMs = 500 -> endSec = 4 + 0.9 = 4.9

    expect(sleepSpy).toHaveBeenCalled();
    const lastCall = sleepSpy.mock.lastCall as any[];
    expect(lastCall[1]).toBeCloseTo(5.4, 2);
  });

  it('R-T2: gives up if AudioContext clock does not advance (fails fast)', async () => {
    const unit: ContentUnit = {
      id: 'test-fail-fast',
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

    const workerMock = {} as Worker;
    
    const runner = new DrillRunner(workerMock);
    
    // Restore the spy to test the real _sleepUntilAudioTime logic
    (DrillRunner.prototype as any)._sleepUntilAudioTime.mockRestore();

    vi.useFakeTimers();
    let errorCaught: Error | null = null;
    
    const runPromise = runner.run(unit).catch(e => { errorCaught = e; });
    
    // Fast-forward fake timers by >2000ms. performance.now() inside the loop will advance,
    // but the mocked ctx.currentTime stays at 0.
    await vi.runAllTimersAsync();
    
    await runPromise;
    vi.useRealTimers();
    
    expect(errorCaught).toBeDefined();
    expect(errorCaught!.message).toContain('clock is not advancing');
  });
});
