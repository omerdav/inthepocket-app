import { describe, it, expect } from 'vitest';
import { kits, kitSupportsZones } from './kits';
import { DynamicsGateDrill5 } from '../../src/data/bootcamps/dynamics-gate';
import type { Zone } from './kits';

describe('Kits', () => {
  it('kitSupportsZones correctly flags the budget kit for Drill 5', () => {
    const budget = kits.find(k => k.id === 'budget')!;
    
    // Extract unique zones from Drill 5 sequence
    const zones = Array.from(new Set(DynamicsGateDrill5.sequence.map(n => n.drumType as Zone)));
    
    const result = kitSupportsZones(budget, zones);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('snare-rim');
  });
});
