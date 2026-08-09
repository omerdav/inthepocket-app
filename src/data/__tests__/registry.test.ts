import { describe, it, expect } from 'vitest';
import { DRILL_REGISTRY } from '../registry';
import { TOLERANCE_BANDS } from '../toleranceBands';

describe('Drill Registry', () => {
  it('every drill sequence is in ascending targetTimeMs order', () => {
    for (const entry of DRILL_REGISTRY) {
      const seq = entry.unit.sequence;
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i].targetTimeMs).toBeGreaterThanOrEqual(seq[i - 1].targetTimeMs);
      }
    }
  });

  // Pinned per drill, not merely "matches some band". Checking membership in
  // the band set would let drill 1 and drill 5 swap bands and still pass,
  // which is the drift this test exists to catch.
  const ASSIGNED_BANDS: Record<string, keyof typeof TOLERANCE_BANDS> = {
    'dynamics-gate-drill-1': 'Introduction',
    'dynamics-gate-drill-2': 'Developing',
    'dynamics-gate-drill-3': 'Consolidating',
    'dynamics-gate-drill-4': 'Consolidating',
    'dynamics-gate-drill-5': 'Mastery',
    'hh-indep-1': 'Developing',
    'hh-indep-2': 'Consolidating',
    'hh-indep-3': 'Consolidating',
    'hh-indep-4': 'Mastery',
    'hh-indep-5': 'Mastery',
  };

  it('every drill carries the tolerance band the curriculum assigns it', () => {
    for (const entry of DRILL_REGISTRY) {
      const bandName = ASSIGNED_BANDS[entry.unit.id];
      expect(bandName, `no band assigned for ${entry.unit.id}`).toBeDefined();

      const band = TOLERANCE_BANDS[bandName];
      expect(entry.unit.passCriteria.timingWindowMs, `${entry.unit.id} window`)
        .toBe(band.timingWindowMs);
      expect(entry.unit.passCriteria.timingAccuracyPercent, `${entry.unit.id} accuracy`)
        .toBe(band.timingAccuracyPercent);
    }
  });

  it('every drill in the registry has a band assignment', () => {
    const ids = DRILL_REGISTRY.map((e) => e.unit.id).sort();
    expect(ids).toEqual(Object.keys(ASSIGNED_BANDS).sort());
  });

  it('every drill note is exactly on a 16th note subdivision of its bpm', () => {
    // We allow only up to 16th notes (4 subdivisions per beat)
    // 60000 / bpm is the length of one beat in ms.
    // Length of a 16th note is (60000 / bpm) / 4.
    // The targetTimeMs should be an exact multiple of the 16th note length.
    // For floating point errors, a tolerance of 0.1ms is enough to catch math errors while rejecting off-grid literals.
    const SUBDIVISION_TOLERANCE_MS = 0.1;
    
    for (const entry of DRILL_REGISTRY) {
      const drill = entry.unit;
      const sixteenthMs = 60000 / drill.bpm / 4;
      
      for (const note of drill.sequence) {
        const exactSixteenths = note.targetTimeMs / sixteenthMs;
        const nearestSixteenth = Math.round(exactSixteenths);
        const diffMs = Math.abs((exactSixteenths - nearestSixteenth) * sixteenthMs);
        
        expect(diffMs, `Note in ${drill.id} at ${note.targetTimeMs}ms is not on a 16th note grid (nearest 16th: ${nearestSixteenth * sixteenthMs}ms)`).toBeLessThan(SUBDIVISION_TOLERANCE_MS);
      }
    }
  });
});
