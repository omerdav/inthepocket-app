import { test, expect } from './fixtures/virtual-drummer';
import { dismissFirstRun } from './fixtures/virtual-drummer';

test('installed app skips tap and opens directly on kit step', async ({ page, injectVirtualDrummer }) => {
  // R2.1 - skipped outside install project
  test.skip(test.info().project.name !== 'install', 'Only runs against production build in the install project');
  test.setTimeout(45000);

  await injectVirtualDrummer();

  // Clear state just in case
  await page.goto('/');
  await page.evaluate(async () => {
    const dbs = await window.indexedDB.databases();
    for (const db of dbs) {
      if (db.name) window.indexedDB.deleteDatabase(db.name);
    }
  });
  await page.reload();

  const warmup = page.getByTestId('engine-warmup');
  
  // Wait for loading to finish and reach one of the awaiting states
  await expect(warmup).toHaveAttribute('data-phase', /awaiting-(tap|kit)/, { timeout: 15000 });
  
  const phase = await warmup.getAttribute('data-phase');
  console.log(`OBSERVED INITIAL PHASE: ${phase}`);

  // R2.1 - data-phase reaches awaiting-kit without any click
  expect(phase).toBe('awaiting-kit');

  // R2.2 - The drummer can then finish entry and reach a drill
  await expect(async () => {
    await page.evaluate(() => {
      (window as any).__virtualDrummer.hit(38, 100);
    });
    expect(await warmup.getAttribute('data-phase')).not.toBe('awaiting-kit');
  }).toPass({ timeout: 5000 });

  await expect(warmup).not.toBeVisible({ timeout: 10000 });

  await dismissFirstRun(page);
  await expect(page.getByTestId('drill-session')).toBeVisible({ timeout: 10000 });

  // R2.3 - crossOriginIsolated is true
  const coi = await page.evaluate(() => window.crossOriginIsolated);
  expect(coi).toBe(true);
});
