import { test, expect } from './fixtures/virtual-drummer';
import { enterApp } from './helpers';

test.describe('ThroneView & GrooveCircle QA', () => {
  test.beforeEach(async ({ injectVirtualDrummer }) => {
    await injectVirtualDrummer();
  });

  test('G1 - Blind Mode E2E', async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-1');
    await enterApp(page);
    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });
    
    // Setup blind mode threshold = 4
    await page.evaluate(() => {
      if (true) {
        window.dispatchEvent(new window.CustomEvent('itp-set-blind-mode', { detail: { enabled: true, threshold: 4 } }));
      }
    });

    // 8 perfect hits
    await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'perfect', timeMs: undefined, noFlush: false } }));
        await new Promise(r => setTimeout(r, 16)); // wait roughly 1 frame
      }
    });
    
    // Wait for opacity to mathematically fade over frames (5 seconds is 5000ms)
    await page.waitForTimeout(2500); // 2000ms fade duration + buffer
    
    // Assert opacity hits 0
    let opacity = await page.evaluate(() => parseFloat((document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastOpacity || '0'));
    expect(opacity).toBeLessThan(0.05);

    // 1 Late hit
    await page.evaluate(async () => {
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'late', timeMs: undefined, noFlush: false } }));
      await new Promise(r => requestAnimationFrame(r));
    });

    // Assert opacity snaps to 1
    opacity = await page.evaluate(() => parseFloat((document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastOpacity || '0'));
    expect(opacity).toBeGreaterThan(0.9);
  });

  test('G2 - Visual Pixel Test', async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-1');
    await enterApp(page);
    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });
    
    await page.clock.install({ time: 1000 });
    
    await page.evaluate(async () => {
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'perfect', timeMs: 1000, noFlush: false } }));
    });
    
    await page.clock.pauseAt(1016);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toHaveScreenshot('g2-perfect-glow.png');
  });

  test('G3 - Tuner Pulse Color', async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-1');
    await enterApp(page);
    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });

    let earlyColor = await page.evaluate(() => {
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'early', timeMs: 1000, noFlush: false } }));
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-force-render', { detail: { timeMs: 1010 } }));
      return (document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastHitColor;
    });
    expect(earlyColor).toBe('hsl(45, 95%, 55%)'); // Yellow

    let lateColor = await page.evaluate(() => {
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'late', timeMs: 1000, noFlush: false } }));
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-force-render', { detail: { timeMs: 1010 } }));
      return (document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastHitColor;
    });
    expect(lateColor).toBe('hsl(0, 80%, 55%)'); // Red
  });

  test('G4 - Arrow Indicator', async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-1');
    await enterApp(page);
    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });
    
    let perfectColor = await page.evaluate(() => {
      if ((window as any).setHitVisualMode) {
        (window as any).setHitVisualMode('arrows');
      }
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'perfect', timeMs: 1000, noFlush: false } }));
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-force-render', { detail: { timeMs: 1010 } }));
      return (document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastHitColor;
    });
    expect(perfectColor).toBe('hsl(142, 76%, 45%)'); // Green

    let earlyColor = await page.evaluate(() => {
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'early', timeMs: 1000, noFlush: false } }));
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-force-render', { detail: { timeMs: 1010 } }));
      return (document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastHitColor;
    });
    expect(earlyColor).toBe('hsl(45, 95%, 55%)'); // Yellow

    let lateColor = await page.evaluate(() => {
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'late', timeMs: 1000, noFlush: false } }));
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-force-render', { detail: { timeMs: 1010 } }));
      return (document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastHitColor;
    });
    expect(lateColor).toBe('hsl(0, 80%, 55%)'); // Red
  });
  test('G5 - Coalescing Simultaneous Hits (R2)', async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-1');
    await enterApp(page);
    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });
    
    let worstColor = await page.evaluate(async () => {
      // Simulate two hits in the same frame (within 30ms window)
      // One perfect (green), one late (red)
      // The coalescer should pick the worst (red)
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'late', timeMs: 1000, noFlush: true } }));
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-simulate-hit', { detail: { type: 'perfect', timeMs: 1005, noFlush: false } }));
      
      // Wait for the coalescing timer (30ms) to fire
      await new Promise(r => setTimeout(r, 40));
      document.querySelector('[data-testid="groove-circle-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-force-render', { detail: { timeMs: 1050 } }));
      return (document.querySelector('[data-testid="groove-circle-canvas"]') as HTMLElement)?.dataset.lastHitColor;
    });
    
    expect(worstColor).toBe('hsl(0, 80%, 55%)'); // Should be Red, not Green
  });
});
