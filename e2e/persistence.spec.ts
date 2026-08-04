import { test, expect } from './fixtures/virtual-drummer';

/**
 * M6 checkpoint: progress survives a reload.
 *
 * Uses real IndexedDB in a real browser — the store abstraction is unit-tested
 * against an in-memory backend, but that proves the rules, not the storage.
 * This proves the storage.
 */

const NOTE_COUNT = 16;
const NOTE_SPACING_MS = 375;
const ACCENT_EVERY = 8;

/** Play Drill 1 cleanly, through the production path. */
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

/** Read what actually landed in IndexedDB. */
async function readStored(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const { progressionStore, telemetryStore } = await import('/src/store/index.ts');
    return {
      progression: await progressionStore.load(),
      telemetry: await telemetryStore.history(),
    };
  });
}

test.beforeEach(async ({ page, injectVirtualDrummer }) => {
  await injectVirtualDrummer();
  await page.goto('/');
  // Start each test from a clean database.
  await page.evaluate(async () => {
    const { db, ALL_STORES } = await import('/src/store/index.ts');
    for (const s of ALL_STORES) await db.clear(s);
  });
  await page.reload();
  await expect(page.getByTestId('drill-session')).toBeVisible();
});

test('a fresh install shows no mastery badge', async ({ page }) => {
  await expect(page.getByTestId('drill-mastered')).toHaveCount(0);
});

test('passing a drill survives a reload', async ({ page }) => {
  test.setTimeout(90000);

  await playCleanRun(page);
  await expect(page.getByTestId('drill-result')).toHaveAttribute('data-passed', 'true');

  // The badge appears immediately...
  await expect(page.getByTestId('drill-mastered')).toBeVisible();

  // ...and is still there after a full reload, which is the whole point.
  await page.reload();
  await expect(page.getByTestId('drill-session')).toBeVisible();
  await expect(page.getByTestId('drill-mastered')).toBeVisible();
});

test('the attempt is written to progression and telemetry', async ({ page }) => {
  test.setTimeout(90000);

  await playCleanRun(page);
  await page.reload();
  await expect(page.getByTestId('drill-session')).toBeVisible();

  const { progression, telemetry } = await readStored(page);

  expect(progression.drills['dynamics-gate-drill-1']).toMatchObject({
    attempts: 1,
    passes: 1,
  });
  expect(progression.drills['dynamics-gate-drill-1'].masteredAt).not.toBeNull();
  expect(progression.streak.current).toBe(1);

  expect(telemetry).toHaveLength(1);
  expect(telemetry[0].drillId).toBe('dynamics-gate-drill-1');
  expect(telemetry[0].passed).toBe(true);
  // Timing spread is recorded, not just the mean — it is what separates a
  // consistent rusher from an inconsistent player.
  expect(telemetry[0]).toHaveProperty('offsetStdDevMs');
  expect(Number.isFinite(telemetry[0].offsetStdDevMs)).toBe(true);
});

test('mastery is per drill, not global', async ({ page }) => {
  test.setTimeout(90000);

  await playCleanRun(page);
  await expect(page.getByTestId('drill-mastered')).toBeVisible();

  // A different drill must not inherit the badge.
  await page.goto('/?drill=dynamics-gate-drill-3');
  await expect(page.getByTestId('drill-session')).toBeVisible();
  await expect(page.getByTestId('drill-mastered')).toHaveCount(0);

  // ...and returning to the first one still shows it.
  await page.goto('/?drill=dynamics-gate-drill-1');
  await expect(page.getByTestId('drill-mastered')).toBeVisible();
});

test('hi-hat calibration is stored and restored', async ({ page }) => {
  const stored = await page.evaluate(async () => {
    const { profilesStore } = await import('/src/store/index.ts');
    // Inverted polarity, as a Yamaha module reports it.
    await profilesStore.saveHiHatCalibration(127, 0);
    return profilesStore.hiHatCalibration();
  });
  expect(stored).toMatchObject({ min: 127, max: 0 });

  await page.reload();
  const afterReload = await page.evaluate(async () => {
    const { profilesStore } = await import('/src/store/index.ts');
    return profilesStore.hiHatCalibration();
  });
  expect(afterReload).toMatchObject({ min: 127, max: 0 });
});
