import { describe, it, expect } from 'vitest';
import { mulberry32, gaussian } from './rng';
import { generatePerformance } from './performance';
import { drummers } from './drummers';
import { kits } from './kits';
import type { DrillNote } from '../../src/data/types';

describe('Simulation RNG & Performance', () => {
  it('rng gives identical output for same seed', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    expect(rng1()).toBe(rng2());
    expect(rng1()).toBe(rng2());
  });

  it('gaussian maps roughly to mean and stdDev over 1000 samples', () => {
    const rng = mulberry32(12345);
    let sum = 0;
    const samples = 1000;
    const values: number[] = [];
    for (let i = 0; i < samples; i++) {
      const v = gaussian(rng, 10, 5);
      sum += v;
      values.push(v);
    }
    const mean = sum / samples;
    expect(mean).toBeGreaterThan(9.5);
    expect(mean).toBeLessThan(10.5);

    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / samples;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeGreaterThan(4.5);
    expect(stdDev).toBeLessThan(5.5);
  });

  it('generatePerformance returns identical output for same seed', () => {
    const sequence: DrillNote[] = [
      { targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: true }
    ];
    const rachel = drummers.find(d => d.id === 'rachel')!;
    const alesis = kits.find(k => k.id === 'alesis-nitro-pro')!;
    
    const hits1 = generatePerformance(sequence, rachel, alesis, mulberry32(42), 80);
    const hits2 = generatePerformance(sequence, rachel, alesis, mulberry32(42), 80);
    
    expect(hits1).toEqual(hits2);
  });

  it('σ and bias measurably match the profile over 1000 samples', () => {
    const sequence: DrillNote[] = Array.from({ length: 1000 }).map((_, i) => ({
      targetTimeMs: i * 500, // 500ms apart
      drumType: 'snare-head' as const,
      sticking: 'R' as const,
      isAccent: false
    }));
    
    const rachel = drummers.find(d => d.id === 'rachel')!; // bias -35, sigma 14
    const alesis = kits.find(k => k.id === 'alesis-nitro-pro')!;
    
    const hits = generatePerformance(sequence, rachel, alesis, mulberry32(42), 120);
    
    let sumOffset = 0;
    const offsets = hits.map((h, i) => {
      const offset = h.offsetMsFromDrillStart - sequence[i].targetTimeMs;
      sumOffset += offset;
      return offset;
    });
    
    const meanOffset = sumOffset / hits.length;
    expect(meanOffset).toBeGreaterThan(-36);
    expect(meanOffset).toBeLessThan(-34);
    
    const variance = offsets.reduce((acc, off) => acc + Math.pow(off - meanOffset, 2), 0) / hits.length;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeGreaterThan(13);
    expect(stdDev).toBeLessThan(15);
  });
});
