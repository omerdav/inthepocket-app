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
    passCriteria: { timingWindowMs: 50, timingAccuracyPercent: 80, consecutiveBarsRequired: 1 },
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
    passCriteria: { timingWindowMs: 50, timingAccuracyPercent: 80, consecutiveBarsRequired: 1 },
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
      hasSeenNote: (_note: number) => false,
      hasSeenPedal: false
    };
    const result = checkHardwareCapability(dummyDrillWithRim, null, mockMidiEngine);
    expect(result.ok).toBe(true); // Still ok to play, just a warning
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual(['snare-rim']);
  });

  /**
   * The pedal (P-22). A chick arrives as a controller rather than a note on
   * most modules, so `hasSeenNote` cannot vouch for it — and a pedal resting
   * fully open reads 0, so its value cannot either.
   */
  const dummyDrillWithChick: ContentUnit = {
    id: 'drill-chick',
    name: 'Drill with hi-hat pedal',
    tier: 'T1',
    category: 'tech',
    bpm: 60,
    sequence: [
      { targetTimeMs: 0, drumType: 'kick', sticking: '', isAccent: false },
      { targetTimeMs: 500, drumType: 'hihat-chick', sticking: '', isAccent: false }
    ],
    passCriteria: { timingWindowMs: 50, timingAccuracyPercent: 80, consecutiveBarsRequired: 1 },
    failureDiagnostics: []
  };

  it('warns when a drill needs the hi-hat pedal and neither the pedal nor note 44 has been seen', () => {
    const result = checkHardwareCapability(dummyDrillWithChick, null, {
      hasSeenNote: (_note: number) => false,
      hasSeenPedal: false
    });
    // Still playable — the drummer may simply not have touched it yet — but
    // they are told before Start rather than shown nine missing notes after.
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(['hihat-chick']);
  });

  it('does not warn once the pedal controller has sent anything', () => {
    const result = checkHardwareCapability(dummyDrillWithChick, null, {
      hasSeenNote: (_note: number) => false,
      hasSeenPedal: true
    });
    expect(result.warnings).toEqual([]);
  });

  it('does not warn for a module that sends a physical note 44 instead of controller data', () => {
    // Equally playable, so controller silence alone must not raise the warning.
    const result = checkHardwareCapability(dummyDrillWithChick, null, {
      hasSeenNote: (note: number) => note === 44,
      hasSeenPedal: false
    });
    expect(result.warnings).toEqual([]);
  });
});
