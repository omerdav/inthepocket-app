import { describe, it, expect } from 'vitest';
import { calculateCategoryPlacement, calculatePlacement } from '../placementLogic';
import { MAX_PLACEMENT_DEPTH } from '../../../store/ProgressionStore';

describe('placementLogic', () => {
  it('places skipped or failed performance at introduction', () => {
    expect(calculateCategoryPlacement('skipped')).toBe('introduction');
    expect(calculateCategoryPlacement('failed')).toBe('introduction');
  });

  it('places basic performance at developing', () => {
    expect(calculateCategoryPlacement('basic')).toBe('developing');
  });

  it('places consistent performance at consolidating', () => {
    expect(calculateCategoryPlacement('consistent')).toBe('consolidating');
  });

  it('caps strong performance at MAX_PLACEMENT_DEPTH', () => {
    expect(calculateCategoryPlacement('strong')).toBe(MAX_PLACEMENT_DEPTH);
  });

  it('calculates full placement for all categories independently', () => {
    const result = calculatePlacement({
      timing: 'basic',
      dynamics: 'skipped',
      independence: 'strong'
    });
    
    expect(result).toEqual({
      timing: 'developing',
      dynamics: 'introduction',
      independence: MAX_PLACEMENT_DEPTH
    });
  });
});
