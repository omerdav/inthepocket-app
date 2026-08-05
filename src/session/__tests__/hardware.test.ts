import { describe, it, expect } from 'vitest';
import { checkHardwareCapability } from '../hardware';
import type { ContentUnit } from '../../data/types';

describe('hardware capability checks', () => {
  const dummyDrillWithRim: ContentUnit = {
    id: 'drill-rim',
    name: 'Drill with rim',
    tier: 'T1',
    category: 'tech',
    bpm: 60,
    sequence: [
      { targetTimeMs: 0, drumType: 'kick', sticking: '', isAccent: false },
      { targetTimeMs: 500, drumType: 'snare-rim', sticking: 'R', isAccent: false }
    ],
    passCriteria: { timingWindowMs: 50, timingAccuracyPercent: 80, dynamicContrastDb: 10, consecutiveBarsRequired: 1 },
    failureDiagnostics: []
  };

  const dummyDrillNoRim: ContentUnit = {
    id: 'drill-no-rim',
    name: 'Drill without rim',
    tier: 'T1',
    category: 'tech',
    bpm: 60,
    sequence: [
      { targetTimeMs: 0, drumType: 'kick', sticking: '', isAccent: false },
      { targetTimeMs: 500, drumType: 'snare-head', sticking: 'R', isAccent: false }
    ],
    passCriteria: { timingWindowMs: 50, timingAccuracyPercent: 80, dynamicContrastDb: 10, consecutiveBarsRequired: 1 },
    failureDiagnostics: []
  };

  it('returns ok: false and missing: ["snare-rim"] when the kit explicitly lacks a rim zone', () => {
    // R-T1
    const result = checkHardwareCapability(dummyDrillWithRim, { 'snare-rim': null });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['snare-rim']);
  });

  it('returns ok: true when drill only requires snare-head and kick', () => {
    // R-T2
    const result = checkHardwareCapability(dummyDrillNoRim, { 'snare-rim': null });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('warns if snare-rim is in the drill but not seen by MidiEngine, even if not explicitly mapped null', () => {
    const mockMidiEngine = {
      hasSeenNote: (_note: number) => false 
    };
    const result = checkHardwareCapability(dummyDrillWithRim, null, mockMidiEngine);
    expect(result.ok).toBe(true); // Still ok to play, just a warning
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual(['snare-rim']);
  });
});
