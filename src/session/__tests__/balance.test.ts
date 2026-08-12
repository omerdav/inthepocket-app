import { describe, it, expect, beforeEach } from 'vitest';
import { BalanceTracker } from '../balance';

describe('BalanceTracker', () => {
  let tracker: BalanceTracker;

  beforeEach(() => {
    tracker = new BalanceTracker();
  });

  it('reports balanced hands when velocities are equal', () => {
    for (let i = 0; i < 4; i++) {
      tracker.registerHit('L', 100);
      tracker.registerHit('R', 100);
    }
    expect(tracker.hasEnoughData).toBe(true);
    expect(tracker.leftMean).toBe(100);
    expect(tracker.rightMean).toBe(100);
  });

  it('reports a weak left hand correctly', () => {
    for (let i = 0; i < 4; i++) {
      tracker.registerHit('L', 60);
      tracker.registerHit('R', 100);
    }
    expect(tracker.hasEnoughData).toBe(true);
    expect(tracker.leftMean).toBe(60);
    expect(tracker.rightMean).toBe(100);
  });

  it('reports insufficient data if fewer than 4 hits per hand', () => {
    for (let i = 0; i < 3; i++) {
      tracker.registerHit('L', 100);
      tracker.registerHit('R', 100);
    }
    expect(tracker.hasEnoughData).toBe(false);
  });

  it('excludes notes without sticking', () => {
    for (let i = 0; i < 4; i++) {
      tracker.registerHit('L', 100);
      tracker.registerHit('R', 100);
    }
    tracker.registerHit('', 50); // Kick drum
    tracker.registerHit(undefined, 50); // Just in case
    
    expect(tracker.leftCount).toBe(4);
    expect(tracker.rightCount).toBe(4);
    expect(tracker.leftMean).toBe(100);
    expect(tracker.rightMean).toBe(100);
  });

  it('progressively declines over a drill (fatigue) moving the marker monotonically', () => {
    for (let i = 0; i < 4; i++) {
      tracker.registerHit('L', 100);
      tracker.registerHit('R', 100);
    }
    
    expect(tracker.leftMean).toBe(100);
    
    // Fatigue sets in
    tracker.registerHit('L', 80);
    expect(tracker.leftMean).toBe(96); // (400 + 80) / 5
    
    tracker.registerHit('L', 60);
    expect(tracker.leftMean).toBe(90); // (480 + 60) / 6
  });
});
