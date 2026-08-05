import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScoringWorkerCalculateMessage } from '../scoring.types';
import { DiagnosticRuleId } from '../scoring.types';

// Mock self for the worker
const postMessageMock = vi.fn();
vi.stubGlobal('self', {
  postMessage: postMessageMock,
  onmessage: null as any
});

describe('ScoringWorker Dynamics & Diagnostics', () => {

  beforeEach(async () => {
    postMessageMock.mockClear();
    // Dynamically import to prevent hoisting issues
    await import('../ScoringWorker');
    
    // Initialize the worker buffers
    self.onmessage!({
      data: { type: 'init', bufferSize: 10 }
    } as any);
  });

  it('Dynamics Scoring Accuracy: Grades ghost notes and accents correctly', () => {
    // 2 Targets:
    // Target 0: Accent on Snare Head at 1000ms
    // Target 1: Ghost on Snare Head at 1250ms
    const calculateMsg: ScoringWorkerCalculateMessage = {
      type: 'calculate',
      numTargets: 2,
      numHits: 2,
      targetBeats: new Float64Array([1000, 1250]),
      targetVelocityMin: new Float32Array([90, 15]), // ACCENT min, GHOST min
      targetVelocityMax: new Float32Array([127, 35]), // ACCENT max, GHOST max
      targetZones: new Int8Array([38, 38]), // Snare Head
      hitTimestamps: new Float64Array([1005, 1245]), // Hits very close to targets
      hitVelocities: new Float32Array([100, 25]), // Accent hit, Ghost hit
      hitZones: new Int8Array([38, 38])
    };

    self.onmessage!({ data: calculateMsg } as any);

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const result = postMessageMock.mock.calls[0][0];
    
    // Both hits should be dynamically passing (1)
    expect(result.dynamicScores[0]).toBe(1);
    expect(result.dynamicScores[1]).toBe(1);
    
    // Both hits should be OK diagnostically
    expect(result.diagnosticRuleIds[0]).toBe(DiagnosticRuleId.OK);
    expect(result.diagnosticRuleIds[1]).toBe(DiagnosticRuleId.OK);
  });

  it('Dynamics Scoring Accuracy: Fails if velocity is out of bounds', () => {
    // Target: Ghost on Snare Head at 1000ms
    const calculateMsg: ScoringWorkerCalculateMessage = {
      type: 'calculate',
      numTargets: 1,
      numHits: 1,
      targetBeats: new Float64Array([1000]),
      targetVelocityMin: new Float32Array([15]), // GHOST min
      targetVelocityMax: new Float32Array([35]), // GHOST max
      targetZones: new Int8Array([38]), 
      hitTimestamps: new Float64Array([1000]), 
      hitVelocities: new Float32Array([80]), // Too loud!
      hitZones: new Int8Array([38])
    };

    self.onmessage!({ data: calculateMsg } as any);

    const result = postMessageMock.mock.calls[0][0];
    
    // Should fail dynamic score
    expect(result.dynamicScores[0]).toBe(0);
    
    // Should emit GHOST_TOO_LOUD diagnostic
    expect(result.diagnosticRuleIds[0]).toBe(DiagnosticRuleId.GHOST_TOO_LOUD);
  });

  it('R-T1: Simultaneous notes prefer exact zone match over whichever hit is first', () => {
    // Two targets at same time, different zones
    const calculateMsg: ScoringWorkerCalculateMessage = {
      type: 'calculate',
      numTargets: 2,
      numHits: 2,
      targetBeats: new Float64Array([1000, 1000]),
      targetVelocityMin: new Float32Array([1, 1]),
      targetVelocityMax: new Float32Array([127, 127]),
      targetZones: new Int8Array([36, 44]), // Kick, Chick
      hitTimestamps: new Float64Array([1000, 1000]),
      hitVelocities: new Float32Array([100, 100]),
      hitZones: new Int8Array([44, 36]) // Hits are swapped in order (Chick first, then Kick)
    };

    self.onmessage!({ data: calculateMsg } as any);
    const result = postMessageMock.mock.calls[0][0];

    // Neither should be a MISS. They should match correctly.
    // Kick target (0) should match Kick hit (1). Both have zone match OK.
    expect(result.categories[0]).not.toBe(3); // Not MISS
    expect(result.categories[1]).not.toBe(3); // Not MISS
    // Since zone matches, ZONE_CONFUSION should not be emitted
    expect(result.diagnosticRuleIds[0]).not.toBe(DiagnosticRuleId.ZONE_CONFUSION);
    expect(result.diagnosticRuleIds[1]).not.toBe(DiagnosticRuleId.ZONE_CONFUSION);
  });

  it('R-T2: Tolerance scales with timingWindowMs', () => {
    // A hit 120ms late.
    // With lenient window (e.g. 100ms), it's just RED or YELLOW (actually RED since > 1.67*100=167). Wait, if window is 100, YELLOW is 167, RED is >167. So 120ms is YELLOW.
    const msgLenient: ScoringWorkerCalculateMessage = {
      type: 'calculate',
      numTargets: 1,
      numHits: 1,
      targetBeats: new Float64Array([1000]),
      targetVelocityMin: new Float32Array([1]),
      targetVelocityMax: new Float32Array([127]),
      targetZones: new Int8Array([38]),
      hitTimestamps: new Float64Array([1120]), // 120ms late
      hitVelocities: new Float32Array([100]),
      hitZones: new Int8Array([38]),
      timingWindowMs: 100
    };

    self.onmessage!({ data: msgLenient } as any);
    const resultLenient = postMessageMock.mock.calls[0][0];
    postMessageMock.mockClear();

    // 120ms is within YELLOW for a 100ms green window (100 * 1.67 = 167)
    expect(resultLenient.categories[0]).toBe(1); // YELLOW

    // With strict window (e.g. 20ms), ceiling is max(150, 20*4) = 150.
    // 120ms is > 20*1.67 (33ms), but < 150, so it's RED.
    // Wait, let's make it 160ms. For 20ms window, 160ms > 150 (ceiling), so it becomes a MISS!
    const msgStrict: ScoringWorkerCalculateMessage = {
      ...msgLenient,
      hitTimestamps: new Float64Array([1160]), // 160ms late
      timingWindowMs: 20
    };
    self.onmessage!({ data: msgStrict } as any);
    const resultStrict = postMessageMock.mock.calls[0][0];
    postMessageMock.mockClear();
    expect(resultStrict.categories[0]).toBe(3); // MISS because > 150ms ceiling
  });

  it('R-T3: Hit far outside window is RED, not MISS', () => {
    // Window is 30. Ceiling is max(150, 30*4)=150.
    // Hit is 140ms late.
    // > 50 (YELLOW threshold), so RED, not MISS.
    const msg: ScoringWorkerCalculateMessage = {
      type: 'calculate',
      numTargets: 1,
      numHits: 1,
      targetBeats: new Float64Array([1000]),
      targetVelocityMin: new Float32Array([1]),
      targetVelocityMax: new Float32Array([127]),
      targetZones: new Int8Array([38]),
      hitTimestamps: new Float64Array([1140]), // 140ms late
      hitVelocities: new Float32Array([100]),
      hitZones: new Int8Array([38]),
      timingWindowMs: 30
    };
    self.onmessage!({ data: msg } as any);
    const result = postMessageMock.mock.calls[0][0];
    expect(result.categories[0]).toBe(2); // RED
  });

  it('R-T3: Publishes struck zone, and MISS carries sentinel', () => {
    // 2 Targets: one hit correctly, one missed completely
    const calculateMsg: ScoringWorkerCalculateMessage = {
      type: 'calculate',
      numTargets: 2,
      numHits: 1,
      targetBeats: new Float64Array([1000, 2000]),
      targetVelocityMin: new Float32Array([1, 1]),
      targetVelocityMax: new Float32Array([127, 127]),
      targetZones: new Int8Array([38, 36]), // Snare Head, Kick
      hitTimestamps: new Float64Array([1000]), // Hit on the snare
      hitVelocities: new Float32Array([100]),
      hitZones: new Int8Array([40]), // Hit Snare Rim instead of Snare Head
      timingWindowMs: 30
    };
    self.onmessage!({ data: calculateMsg } as any);
    const result = postMessageMock.mock.calls[0][0];

    // First target should be a hit (with wrong zone)
    expect(result.struckZones[0]).toBe(40);
    // Second target should be a MISS
    expect(result.categories[1]).toBe(3);
    // MISS should carry sentinel -1
    expect(result.struckZones[1]).toBe(-1);
  });

});
