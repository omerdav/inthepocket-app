import { test, expect } from '../fixtures/virtual-drummer';
import { drummers } from './drummers';
import { kits, kitSupportsZones, type Zone } from './kits';
import { getDrill } from '../../src/data/registry';
import { runSimulation } from './harness';
import type { SimulationRun } from './report';
import { generateReport, writeJsonReport, writeMarkdownReport } from './report';

test.describe('Simulation Matrix', () => {
  // Skip unless explicitly enabled — too slow for CI
  test.skip(process.env.SIMULATION_MATRIX !== '1');
  
  test.describe.configure({ timeout: 120_000 });
  
  const SEEDS = [42, 123, 7];
  
  const allDrillsPersonas = ['fiona', 'ben', 'greta', 'hank'];
  const drill1OnlyPersonas = ['rachel', 'sam', 'frank'];
  
  const combos: { drummerId: string, drillId: string, kitId: string }[] = [];
  
  for (const kit of kits) {
    for (const drummerId of allDrillsPersonas) {
      combos.push({ drummerId, kitId: kit.id, drillId: 'dynamics-gate-drill-1' });
      combos.push({ drummerId, kitId: kit.id, drillId: 'dynamics-gate-drill-5' });
    }
    for (const drummerId of drill1OnlyPersonas) {
      combos.push({ drummerId, kitId: kit.id, drillId: 'dynamics-gate-drill-1' });
    }
  }

  const results: SimulationRun[] = [];

  for (const combo of combos) {
    for (const seed of SEEDS) {
      const drummerName = drummers.find(d => d.id === combo.drummerId)!.name;
      const kitName = kits.find(k => k.id === combo.kitId)!.name;
      
      test(`${drummerName} × ${kitName} × ${combo.drillId} [seed ${seed}]`, async ({ page, injectVirtualDrummer }) => {
        test.setTimeout(60_000);
        await injectVirtualDrummer();
        
        const kit = kits.find(k => k.id === combo.kitId)!;
        const drill = getDrill(combo.drillId)!;
        const zones = Array.from(new Set(drill.sequence.map(n => n.drumType as Zone)));
        const { ok, missing } = kitSupportsZones(kit, zones);
        
        const result = await runSimulation(page, combo.drummerId, combo.kitId, combo.drillId, seed);
        
        let diagnosisCorrect: boolean | 'unverifiable' = 'unverifiable';
        if (result.expected.category === 'unplayable') {
          // Prediction 4: app has no unplayable detection, do not assert. 
          diagnosisCorrect = 'unverifiable';
        } else {
          diagnosisCorrect = result.expected.regex!.test(result.diagnosis);
          expect.soft(result.diagnosis).toMatch(result.expected.regex!);
        }
        
        results.push({
          drummerId: combo.drummerId,
          kitId: combo.kitId,
          drillId: combo.drillId,
          seed,
          supported: ok,
          missingZones: missing || [],
          passed: result.passed === 'true',
          accuracyPercent: parseInt(result.accuracy) || 0,
          diagnosisShown: result.diagnosis,
          diagnosisExpected: result.expected.category,
          diagnosisCorrect,
          notes: []
        });
      });
    }
  }
  
  test.afterAll(() => {
    if (results.length > 0) {
      const report = generateReport(results);
      const outDir = 'e2e/simulation/reports';
      writeJsonReport(report, outDir);
      writeMarkdownReport(report, outDir);
    }
  });
});
