import { describe, it, expect } from 'vitest';
import { calculateDecouplingScore } from '../DecouplingMath';

describe('DecouplingMath', () => {

  it('detrends wandering global tempo to catch high correlation', () => {
    // Generate a wandering global tempo drift
    const drift = [0, 5, 15, 30, 45, 60, 50, 40, 25, 10, 0, -10, -15, -10, 0, 5];
    
    // Hand plays exactly on the drifted tempo
    const hand = [...drift];
    
    // Foot plays EXACTLY mimicking the hand, meaning it is totally dependent
    const foot = [...drift];

    const score = calculateDecouplingScore(hand, foot);
    
    // Should be perfectly correlated (1.0) because the math detrends and sees they move identically
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('bypasses correlation (returns 0) if variance is extremely low (robotic precision)', () => {
    // Hand and foot are playing basically perfectly with <1ms variance
    const hand = [0.1, -0.2, 0.1, 0, -0.1, 0.2];
    const foot = [0, 0.1, -0.1, 0.2, 0, -0.2];

    const score = calculateDecouplingScore(hand, foot);
    
    // Variance guard should kick in and return 0
    expect(score).toBe(0);
  });

  it('returns low correlation for actually independent limbs', () => {
    // Hand rushes slightly randomly
    const hand = [0, 15, -5, 20, 10, -10, 5, 25];
    // Foot stays steady or has its own uncorrelated drift
    const foot = [0, -2, 3, -1, 4, 1, -3, 2];

    const score = calculateDecouplingScore(hand, foot);
    
    // Should be a low score (e.g. < 0.3)
    expect(score).toBeLessThan(0.4);
  });

});
