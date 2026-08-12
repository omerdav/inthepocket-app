import { test, expect } from './fixtures/virtual-drummer';
import { enterApp } from './helpers';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page, injectVirtualDrummer }) => {
  await injectVirtualDrummer();
  await page.goto('/');
  await enterApp(page);
});

const stickHit = (page: import('@playwright/test').Page, note: number) =>
  page.evaluate((n) => {
    (window as any).__virtualDrummer.hit(n, 100);
  }, note);

test('R3: Stick navigation round trip: menu -> play -> result -> play again', async ({ page }) => {
  test.setTimeout(60000);

  // 1. Launch a drill from the menu
  await stickHit(page, 40); // stick-scroll-down
  await expect(page.getByTestId('tab-fun')).toHaveClass(/focused/);
  await page.waitForTimeout(100); // 80ms UI debounce for rim hits
  await stickHit(page, 40); // stick-scroll-down
  await expect(page.getByTestId('menu-item-dynamics-gate-drill-1')).toHaveClass(/selected/);
  await page.waitForTimeout(100); // Wait for debounce before select (just in case)
  
  // Setup drill start promise BEFORE selecting the drill
  await page.evaluate(() => {
    (window as any).__drillStart = new Promise<number>((resolve) => {
      window.addEventListener('itp-drill-phase', (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.phase === 'playing' && typeof d.startPerfMs === 'number') resolve(d.startPerfMs);
      });
    });
  });

  await stickHit(page, 38); // stick-select

  // 2. Play it to a result
  await page.evaluate(async () => {
    const vd = (window as any).__virtualDrummer;
    const start = await (window as any).__drillStart;

    const spacing = 375;
    for (let i = 0; i < 16; i++) {
      const targetPerfMs = start + i * spacing;
      const waitFor = targetPerfMs - performance.now() - 5;
      if (waitFor > 0) await new Promise(r => setTimeout(r, waitFor));
      const velocity = i % 8 === 0 ? 105 : 62;
      vd.hit(38, velocity, targetPerfMs);
    }
  });

  const result = page.getByTestId('drill-result');
  await expect(result).toBeVisible({ timeout: 15000 });

  // Wait a bit to ensure the UI is ready to accept the retry stick hit
  await page.waitForTimeout(500);
  
  // 3. Return to a playing drill using stick navigation
  await stickHit(page, 36); // Kick triggers select
  
  // 4. Assert the second drill actually reaches playing
  await expect(page.getByTestId('count-in')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });
});

test('R4: Prove the mid-drill guard (stick hits during play do not trigger navigation)', async ({ page }) => {
  test.setTimeout(60000);

  // Launch the drill
  await stickHit(page, 40); 
  await expect(page.getByTestId('tab-fun')).toHaveClass(/focused/);
  await page.waitForTimeout(100);
  await stickHit(page, 40); 
  await expect(page.getByTestId('menu-item-dynamics-gate-drill-1')).toHaveClass(/selected/);
  await page.waitForTimeout(100);
  
  // Setup drill start promise BEFORE selecting the drill
  await page.evaluate(() => {
    (window as any).__drillStart = new Promise<number>((resolve) => {
      window.addEventListener('itp-drill-phase', (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.phase === 'playing' && typeof d.startPerfMs === 'number') resolve(d.startPerfMs);
      });
    });
  });

  await stickHit(page, 38);
  
  // Play drill with 38 (Snare Head) which is also stick-select
  await page.evaluate(async () => {
    const vd = (window as any).__virtualDrummer;
    const start = await (window as any).__drillStart;
    
    const spacing = 375;
    for (let i = 0; i < 16; i++) {
      const targetPerfMs = start + i * spacing;
      const waitFor = targetPerfMs - performance.now() - 5;
      if (waitFor > 0) await new Promise(r => setTimeout(r, waitFor));
      const velocity = i % 8 === 0 ? 105 : 62;
      vd.hit(38, velocity, targetPerfMs);
    }
  });

  const result = page.getByTestId('drill-result');
  await expect(result).toBeVisible({ timeout: 15000 });

  // If we reach the result screen cleanly, the mid-drill hits did not abort or restart the drill.
  const passed = await result.getAttribute('data-passed');
  expect(passed).toBe('true');
});
