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

});
