import { test, expect } from '../fixtures/virtual-drummer';
import { drummers } from './drummers';
import { kits } from './kits';
import { generatePerformance } from './performance';
import { mulberry32 } from './rng';
import { getExpectedDiagnosis } from './oracle';
import { getDrill } from '../../src/data/registry';

test.describe('Simulation Suite Core', () => {
  const alesis = kits.find(k => k.id === 'alesis-nitro-pro')!;
  
  async function runSimulation(page: any, drummerId: string, kitId: string, drillId: string, seed: number) {
    const drummer = drummers.find(d => d.id === drummerId)!;
    const kit = kits.find(k => k.id === kitId)!;
    const drill = getDrill(drillId);
    if (!drill) throw new Error('Drill not found');
    
    // 1. Generate performance
    const hits = generatePerformance(drill.sequence, drummer, kit, mulberry32(seed), drill.bpm);
    
    // 2. Navigate and wait for drill
    await page.goto(`/?drill=${drillId}`);
    await expect(page.getByTestId('drill-session')).toBeVisible();
    
    // 3. Hook phase event to get startPerfMs
    await page.evaluate(() => {
      (window as any).__drillStart = new Promise<number>((resolve) => {
        const handler = (e: Event) => {
          const d = (e as CustomEvent).detail;
          if (d.phase === 'playing' && typeof d.startPerfMs === 'number') {
            window.removeEventListener('itp-drill-phase', handler);
            resolve(d.startPerfMs);
          }
        };
        window.addEventListener('itp-drill-phase', handler);
      });
    });
    
    // 4. Start drill
    await page.getByTestId('drill-start').click();
    
    // 5. Play hits
    await page.evaluate(async ({ hitsArr }) => {
      const start: number = await (window as any).__drillStart;
      const vd = (window as any).__virtualDrummer;
      
      for (const h of hitsArr) {
        const targetPerfMs = start + h.offsetMsFromDrillStart;
        const waitFor = targetPerfMs - performance.now() - 5;
        if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
        vd.hit(h.noteNumber, h.velocity, targetPerfMs);
      }
    }, { hitsArr: hits });
    
    // 6. Read results
    const resultEl = page.getByTestId('drill-result');
    await expect(resultEl).toBeVisible({ timeout: 15000 });
    
    const passed = await resultEl.getAttribute('data-passed');
    const diagnosis = (await page.getByTestId('result-diagnosis').textContent())?.trim() ?? '';
    const accuracy = (await page.getByTestId('result-accuracy').textContent())?.trim() ?? '';
    
    return { passed, diagnosis, accuracy, expected: getExpectedDiagnosis(drummer, kit, drillId) };
  }

  test('Gigging Greta passes Drill 1 cleanly', async ({ page, injectVirtualDrummer }) => {
    test.setTimeout(60000);
    await injectVirtualDrummer();
    
    const result = await runSimulation(page, 'greta', 'alesis-nitro-pro', 'dynamics-gate-drill-1', 42);
    
    expect(result.diagnosis).toMatch(result.expected.regex!);
  });

  test('Rushing Rachel is diagnosed as rushing', async ({ page, injectVirtualDrummer }) => {
    test.setTimeout(60000);
    await injectVirtualDrummer();
    
    const result = await runSimulation(page, 'rachel', 'alesis-nitro-pro', 'dynamics-gate-drill-1', 42);
    
    expect(result.diagnosis).toMatch(result.expected.regex!);
  });

  test('Scattered Sam is expected to be inconsistent, but prediction 5 says he might be called rushing', async ({ page, injectVirtualDrummer }) => {
    test.fail(); // We know this fails because of the variance check defect
    test.setTimeout(60000);
    await injectVirtualDrummer();
    
    const result = await runSimulation(page, 'sam', 'alesis-nitro-pro', 'dynamics-gate-drill-1', 42);
    
    console.log(`Scattered Sam diagnosis: "${result.diagnosis}"`);
    console.log(`Oracle expected: "${result.expected.category}"`);
    
    expect(result.diagnosis).toMatch(result.expected.regex!);
  });
});
