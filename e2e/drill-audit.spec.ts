import { test, expect } from './fixtures/virtual-drummer';
import { getDrill, DRILL_REGISTRY } from '../src/data/registry';
import { DRUM_TYPE_TO_MIDI } from '../src/data/utils';

test.describe('T-005 Drill Audit', () => {
  for (const entry of DRILL_REGISTRY) {
    const drillId = entry.unit.id;
    
    test(`${drillId} - Perfect Run`, async ({ page, injectVirtualDrummer }) => {
      test.setTimeout(120_000);
      await injectVirtualDrummer();

      const drill = getDrill(drillId)!;
      await page.goto(`/?drill=${drillId}`);

      const warmupOverlay = page.getByTestId('engine-warmup');
      try {
        if (await warmupOverlay.isVisible({ timeout: 2000 })) {
          await warmupOverlay.click();
          await expect(page.getByTestId('warmup-kit')).toBeVisible();
          await page.waitForTimeout(500); // Give effect time to attach listener
          await page.evaluate(() => (window as any).__virtualDrummer.hit(38, 100, performance.now()));
          await expect(warmupOverlay).toBeHidden();
        }
      } catch (e) {}

      await expect(page.getByTestId('drill-session')).toBeVisible();

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

      await page.getByTestId('drill-start').click();

      await page.evaluate(async ({ sequence, drumTypeToMidi }) => {
        const start: number = await (window as any).__drillStart;
        const vd = (window as any).__virtualDrummer;

        for (const note of sequence) {
          const targetPerfMs = start + note.targetTimeMs;
          const waitFor = targetPerfMs - performance.now() - 5;
          if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
          
          const range = note.velocityRange ?? (note.isAccent ? { min: 90, max: 127 } : { min: 40, max: 85 });
          const vel = Math.floor((range.min + range.max) / 2);
          
          if (note.drumType === 'hihat-chick') {
            vd.cc(4, 0, targetPerfMs - 100);
            vd.cc(4, 127, targetPerfMs);
          } else if (note.drumType === 'hihat-open') {
             vd.cc(4, 0, targetPerfMs - 100);
             vd.hit(drumTypeToMidi[note.drumType] || 46, vel, targetPerfMs);
          } else if (note.drumType === 'hihat-closed') {
             vd.cc(4, 127, targetPerfMs - 100);
             vd.hit(drumTypeToMidi[note.drumType] || 42, vel, targetPerfMs);
          } else {
             const midiNote = drumTypeToMidi[note.drumType];
             if (midiNote) {
               vd.hit(midiNote, vel, targetPerfMs);
             }
          }
        }
      }, { sequence: drill.sequence, drumTypeToMidi: DRUM_TYPE_TO_MIDI });

      const resultEl = page.getByTestId('drill-result');
      await expect(resultEl).toBeVisible({ timeout: 60000 });
      
      const passed = await resultEl.getAttribute('data-passed');
      const diagnosis = (await page.getByTestId('result-diagnosis').textContent())?.trim() ?? '';
      
      let decoupling = 'none';
      try { decoupling = (await page.getByTestId('result-decoupling').textContent({ timeout: 1000 }))?.trim() ?? ''; } catch (e) {}
      
      console.log(`[PERFECT RUN for ${drillId}]: Passed=${passed}, Diagnosis="${diagnosis}", Decoupling=${decoupling}`);
    });
    
    test(`${drillId} - Rushing Run`, async ({ page, injectVirtualDrummer }) => {
      test.setTimeout(120_000);
      await injectVirtualDrummer();

      const drill = getDrill(drillId)!;
      await page.goto(`/?drill=${drillId}`);

      const warmupOverlay = page.getByTestId('engine-warmup');
      try {
        if (await warmupOverlay.isVisible({ timeout: 2000 })) {
          await warmupOverlay.click();
          await expect(page.getByTestId('warmup-kit')).toBeVisible();
          await page.waitForTimeout(500); // Give effect time to attach listener
          await page.evaluate(() => (window as any).__virtualDrummer.hit(38, 100, performance.now()));
          await expect(warmupOverlay).toBeHidden();
        }
      } catch (e) {}

      await expect(page.getByTestId('drill-session')).toBeVisible();

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

      await page.getByTestId('drill-start').click();

      await page.evaluate(async ({ sequence, drumTypeToMidi }) => {
        const start: number = await (window as any).__drillStart;
        const vd = (window as any).__virtualDrummer;

        for (const note of sequence) {
          // Play 40ms early to simulate rushing
          const targetPerfMs = start + note.targetTimeMs - 40;
          const waitFor = targetPerfMs - performance.now() - 5;
          if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
          
          const range = note.velocityRange ?? (note.isAccent ? { min: 90, max: 127 } : { min: 40, max: 85 });
          const vel = Math.floor((range.min + range.max) / 2);
          
          if (note.drumType === 'hihat-chick') {
            vd.cc(4, 0, targetPerfMs - 100);
            vd.cc(4, 127, targetPerfMs);
          } else if (note.drumType === 'hihat-open') {
             vd.cc(4, 0, targetPerfMs - 100);
             vd.hit(drumTypeToMidi[note.drumType] || 46, vel, targetPerfMs);
          } else if (note.drumType === 'hihat-closed') {
             vd.cc(4, 127, targetPerfMs - 100);
             vd.hit(drumTypeToMidi[note.drumType] || 42, vel, targetPerfMs);
          } else {
             const midiNote = drumTypeToMidi[note.drumType];
             if (midiNote) {
               vd.hit(midiNote, vel, targetPerfMs);
             }
          }
        }
      }, { sequence: drill.sequence, drumTypeToMidi: DRUM_TYPE_TO_MIDI });

      const resultEl = page.getByTestId('drill-result');
      await expect(resultEl).toBeVisible({ timeout: 60000 });
      
      const passed = await resultEl.getAttribute('data-passed');
      const diagnosis = (await page.getByTestId('result-diagnosis').textContent())?.trim() ?? '';
      console.log(`[RUSHING RUN for ${drillId}]: Passed=${passed}, Diagnosis="${diagnosis}"`);
    });
  }
});
