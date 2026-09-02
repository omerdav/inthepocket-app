import { test, expect } from './fixtures/virtual-drummer';
import { dismissFirstRun } from './fixtures/virtual-drummer';
import { awaitEntryState } from './helpers';

const NOTE_COUNT = 16;
const NOTE_SPACING_MS = 375;
const ACCENT_EVERY = 8;

async function offlineEnterApp(page: import('@playwright/test').Page): Promise<void> {
  const warmup = page.getByTestId('engine-warmup');

  // Same wait as `enterApp` — a count of zero here used to mean "already
  // inside", which is also what a page that has not painted yet looks like
  // (register P-19). This copy exists because the production build has no
  // `/src/audio/midi.ts` to import, not because the entry logic differs.
  if ((await awaitEntryState(page)) === 'inside') {
    await dismissFirstRun(page);
    await expect(page.getByTestId('drill-session')).toBeVisible();
    return;
  }
  await expect(warmup).toHaveAttribute('data-phase', /awaiting-(tap|kit)/, { timeout: 15000 });
  if ((await warmup.getAttribute('data-phase')) === 'awaiting-tap') {
    await warmup.click();
  }
  await expect(warmup).toHaveAttribute('data-phase', 'awaiting-kit', { timeout: 10000 });

  await expect(async () => {
    await page.evaluate(() => {
      (window as any).__virtualDrummer.hit(38, 100);
    });
    expect(await warmup.getAttribute('data-phase')).not.toBe('awaiting-kit');
  }).toPass({ timeout: 5000 });

  await dismissFirstRun(page);
  await expect(page.getByTestId('drill-session')).toBeVisible({ timeout: 10000 });
}

async function playCleanRun(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    (window as any).__drillStart = new Promise<number>((resolve) => {
      window.addEventListener('itp-drill-phase', (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.phase === 'playing' && typeof d.startPerfMs === 'number') resolve(d.startPerfMs);
      });
    });
  });

  await page.getByTestId('drill-start').click();

  await page.evaluate(
    async ({ count, spacing, accentEvery }) => {
      const start: number = await (window as any).__drillStart;
      const vd = (window as any).__virtualDrummer;
      for (let i = 0; i < count; i++) {
        const target = start + i * spacing;
        const wait = target - performance.now() - 5;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        vd.hit(38, i % accentEvery === 0 ? 105 : 62, target);
      }
    },
    { count: NOTE_COUNT, spacing: NOTE_SPACING_MS, accentEvery: ACCENT_EVERY }
  );

  await expect(page.getByTestId('drill-result')).toBeVisible({ timeout: 15000 });
}

test('works completely offline', async ({ page, context, injectVirtualDrummer }) => {
  test.skip(test.info().project.name !== 'offline', 'Only runs against production build in the offline project');
  test.setTimeout(90000);

  await injectVirtualDrummer();

  // We need to clear indexedDB if there's any state
  await page.goto('/');
  await page.evaluate(async () => {
    const dbs = await window.indexedDB.databases();
    for (const db of dbs) {
      if (db.name) window.indexedDB.deleteDatabase(db.name);
    }
  });
  await page.reload();
  
  await offlineEnterApp(page);

  // (a) Service worker registers and reaches activated
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active?.state !== 'activated') {
      await new Promise(r => {
        reg.active?.addEventListener('statechange', () => {
          if (reg.active?.state === 'activated') r(null);
        });
      });
    }
  });
  
  // Actually, wait a bit for clients.claim() to settle if needed
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));

  // (b) crossOriginIsolated is still true
  const coi = await page.evaluate(() => window.crossOriginIsolated);
  expect(coi).toBe(true);

  // Take the network down properly
  await context.setOffline(true);

  // R2 - Demonstrate network down properly
  const networkError = await page.evaluate(async () => {
    try {
      await fetch('/this-does-not-exist-' + Date.now());
      return 'Did not fail (returned 404)';
    } catch (e: any) {
      return e.message;
    }
  });
  expect(networkError).not.toBe('Did not fail (returned 404)');
  expect(typeof networkError).toBe('string');

  // (c) A drill completes with the network off
  await playCleanRun(page);
  await expect(page.getByTestId('drill-result')).toHaveAttribute('data-passed', 'true');

  // (d) Persistence survives - reload offline
  await page.reload();
  await offlineEnterApp(page);
  
  // Check that the mastery badge from playing the clean run survives
  await expect(page.getByTestId('drill-mastered')).toBeVisible();
});
