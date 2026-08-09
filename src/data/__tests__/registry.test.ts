import { describe, it, expect } from 'vitest';
import { DRILL_REGISTRY } from '../registry';

describe('Drill Registry', () => {
  it('every drill sequence is in ascending targetTimeMs order', () => {
    for (const entry of DRILL_REGISTRY) {
      const seq = entry.unit.sequence;
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i].targetTimeMs).toBeGreaterThanOrEqual(seq[i - 1].targetTimeMs);
      }
    }
  });
});
