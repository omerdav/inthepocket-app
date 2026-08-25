import { describe, it, expect } from 'vitest';
import { getProgressionRecommendation } from '../selection';
import { emptyProgression } from '../../../store/ProgressionStore';

describe('Progression selection logic', () => {
  it('returns depths and streak directly from state', () => {
    const state = emptyProgression();
    state.depths = { timing: 'developing', dynamics: 'introduction', independence: 'mastery' };
    state.streak = { current: 3, longest: 10, lastPracticeDay: '2026-08-25' };

    const rec = getProgressionRecommendation(state);
    
    expect(rec.categoryDepths).toEqual({ timing: 'developing', dynamics: 'introduction', independence: 'mastery' });
    expect(rec.streak).toEqual({ current: 3, longest: 10 });
  });

  it('recommends null if no drills have been attempted', () => {
    const state = emptyProgression();
    const rec = getProgressionRecommendation(state);
    expect(rec.nextDrillId).toBeNull();
  });

  it('recommends null if all attempted drills are mastered', () => {
    const state = emptyProgression();
    state.drills = {
      'drill-1': { drillId: 'drill-1', attempts: 5, passes: 5, bestAccuracyPercent: 95, lastAttemptAt: 100, masteredAt: 100 },
      'drill-2': { drillId: 'drill-2', attempts: 5, passes: 5, bestAccuracyPercent: 95, lastAttemptAt: 200, masteredAt: 200 },
    };
    const rec = getProgressionRecommendation(state);
    expect(rec.nextDrillId).toBeNull();
  });

  it('recommends the unmastered drill that has been untouched the longest', () => {
    const state = emptyProgression();
    state.drills = {
      'drill-recently-played': { drillId: 'drill-recently-played', attempts: 2, passes: 0, bestAccuracyPercent: 50, lastAttemptAt: 500, masteredAt: null },
      'drill-oldest': { drillId: 'drill-oldest', attempts: 2, passes: 0, bestAccuracyPercent: 50, lastAttemptAt: 100, masteredAt: null },
      'drill-mastered': { drillId: 'drill-mastered', attempts: 2, passes: 2, bestAccuracyPercent: 100, lastAttemptAt: 50, masteredAt: 50 },
      'drill-middle': { drillId: 'drill-middle', attempts: 2, passes: 0, bestAccuracyPercent: 50, lastAttemptAt: 300, masteredAt: null },
    };

    const rec = getProgressionRecommendation(state);
    
    // The oldest unmastered drill is drill-oldest (100)
    expect(rec.nextDrillId).toBe('drill-oldest');
  });
});
