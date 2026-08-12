import { describe, it, expect } from 'vitest';
import { calculateDecouplingScore } from '../DecouplingMath';

describe('DecouplingMath', () => {

  it('detrends wandering global tempo to catch high correlation', () => {
    // Generate a wandering global tempo drift (16 points)
    const drift = [0, 5, 15, 30, 45, 60, 50, 40, 25, 10, 0, -10, -15, -10, 0, 5, 10, 15, 20, 15, 10, 5, 0, -5];
    
    // Hand plays exactly on the drifted tempo
    const hand = [...drift];
    
    // Foot plays EXACTLY mimicking the hand, meaning it is totally dependent
    const foot = [...drift];

    const score = calculateDecouplingScore(hand, foot);
    
    // Should be perfectly correlated (1.0) because the math detrends and sees they move identically
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('bypasses correlation (returns 0) if variance is extremely low (robotic precision)', () => {
    // Hand and foot are playing basically perfectly with <1ms variance (16 points)
    const hand = [0.1, -0.2, 0.1, 0, -0.1, 0.2, 0, 0.1, -0.1, 0.2, 0, -0.2, 0.1, 0, -0.1, 0.2];
    const foot = [0, 0.1, -0.1, 0.2, 0, -0.2, 0.1, 0, -0.1, 0.2, 0.1, -0.2, 0, 0.1, -0.1, 0.2];

    const score = calculateDecouplingScore(hand, foot);
    
    // Variance guard should kick in and return 0
    expect(score).toBe(0);
  });

  it('returns low correlation for actually independent limbs', () => {
    // Hand rushes slightly randomly (16 points)
    const hand = [0, 15, -5, 20, 10, -10, 5, 25, 10, -5, 15, -10, 5, 20, -5, 15];
    // Foot stays steady or has its own uncorrelated drift
    const foot = [0, -2, 3, -1, 4, 1, -3, 2, -1, 3, -2, 4, 1, -4, 2, -1];

    const score = calculateDecouplingScore(hand, foot);
    
    // Should be a low score (e.g. < 0.3)
    expect(score).toBeLessThan(0.4);
  });

  it('reproduces R1: shows widely varying score on pure noise', () => {
    const seedRandom = (seed: number) => {
      let x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const noise = (seed: number, n: number, stdDev: number) => {
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let u1 = seedRandom(seed + i * 2);
        let u2 = seedRandom(seed + i * 2 + 1);
        if (u1 === 0) u1 = 0.0001;
        let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        arr[i] = z0 * stdDev;
      }
      return arr;
    };

    const n = 16;
    const stdDev = 5;
    const scores = [];
    for (let i = 0; i < 10; i++) {
      const hand = noise(i * 100, n, stdDev);
      const foot = noise(i * 100 + 50, n, stdDev);
      const score = calculateDecouplingScore(hand, foot);
      scores.push(score !== undefined ? score.toFixed(2) : 'undef');
    }
    console.log("R1 Spread:", scores.join(", "));
  });
});
