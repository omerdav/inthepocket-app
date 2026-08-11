import { test, expect } from './fixtures/virtual-drummer';
import { MIDI_NOTE } from '../src/audio/midi';

test.describe('ThroneView & GrooveCircle QA', () => {
  test.beforeEach(async ({ injectVirtualDrummer }) => {
    await injectVirtualDrummer();
  });

  test('G1 - Blind Mode E2E', async ({ page }) => {
    await page.goto('/?dev=1');
    
    // Setup blind mode threshold = 4
    await page.evaluate(() => {
      if ((window as any).setBlindModeParams) {
        (window as any).setBlindModeParams(true, 4);
      }
    });

    // 8 perfect hits
    await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        (window as any).__E2E_SIMULATE_HIT__('perfect');
        await new Promise(r => setTimeout(r, 16)); // wait roughly 1 frame
      }
    });
    
    // Wait for opacity to mathematically fade over frames (5 seconds is 5000ms)
    await page.waitForTimeout(2500); // 2000ms fade duration + buffer
    
    // Assert opacity hits 0
    let opacity = await page.evaluate(() => (window as any).__E2E_LAST_OPACITY__);
    expect(opacity).toBeLessThan(0.05);

    // 1 Late hit
    await page.evaluate(async () => {
      (window as any).__E2E_SIMULATE_HIT__('late');
      await new Promise(r => requestAnimationFrame(r));
    });

    // Assert opacity snaps to 1
    opacity = await page.evaluate(() => (window as any).__E2E_LAST_OPACITY__);
    expect(opacity).toBeGreaterThan(0.9);
  });

  test('G2 - Visual Pixel Test', async ({ page }) => {
    await page.goto('/?dev=1');
    
    await page.evaluate(async () => {
      (window as any).__E2E_SIMULATE_HIT__('perfect');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // Wait 2 frames for safety
    });

    const canvas = page.locator('canvas').first();
    await expect(canvas).toHaveScreenshot('g2-perfect-glow.png');
  });

  test('G3 - Tuner Pulse Color', async ({ page }) => {
    await page.goto('/?dev=1');

    let earlyColor = await page.evaluate(() => {
      (window as any).__E2E_SIMULATE_HIT__('early', 1000);
      (window as any).__E2E_FORCE_RENDER__(1010);
      return (window as any).__E2E_LAST_HIT_COLOR__;
    });
    expect(earlyColor).toBe('hsl(45, 95%, 55%)'); // Yellow

    let lateColor = await page.evaluate(() => {
      (window as any).__E2E_SIMULATE_HIT__('late', 1000);
      (window as any).__E2E_FORCE_RENDER__(1010);
      return (window as any).__E2E_LAST_HIT_COLOR__;
    });
    expect(lateColor).toBe('hsl(0, 80%, 55%)'); // Red
  });

  test('G4 - Arrow Indicator', async ({ page }) => {
    await page.goto('/?dev=1');
    
    let perfectColor = await page.evaluate(() => {
      if ((window as any).setHitVisualMode) {
        (window as any).setHitVisualMode('arrows');
      }
      (window as any).__E2E_SIMULATE_HIT__('perfect', 1000);
      (window as any).__E2E_FORCE_RENDER__(1010);
      return (window as any).__E2E_LAST_HIT_COLOR__;
    });
    expect(perfectColor).toBe('hsl(142, 76%, 45%)'); // Green

    let earlyColor = await page.evaluate(() => {
      (window as any).__E2E_SIMULATE_HIT__('early', 1000);
      (window as any).__E2E_FORCE_RENDER__(1010);
      return (window as any).__E2E_LAST_HIT_COLOR__;
    });
    expect(earlyColor).toBe('hsl(45, 95%, 55%)'); // Yellow

    let lateColor = await page.evaluate(() => {
      (window as any).__E2E_SIMULATE_HIT__('late', 1000);
      (window as any).__E2E_FORCE_RENDER__(1010);
      return (window as any).__E2E_LAST_HIT_COLOR__;
    });
    expect(lateColor).toBe('hsl(0, 80%, 55%)'); // Red
  });
  test('G5 - Coalescing Simultaneous Hits (R2)', async ({ page }) => {
    await page.goto('/?dev=1');
    
    let worstColor = await page.evaluate(async () => {
      // Simulate two hits in the same frame (within 30ms window)
      // One perfect (green), one late (red)
      // The coalescer should pick the worst (red)
      (window as any).__E2E_SIMULATE_HIT__('late', 1000, true);
      (window as any).__E2E_SIMULATE_HIT__('perfect', 1005);
      
      // Wait for the coalescing timer (30ms) to fire
      await new Promise(r => setTimeout(r, 40));
      (window as any).__E2E_FORCE_RENDER__(1050);
      return (window as any).__E2E_LAST_HIT_COLOR__;
    });
    
    expect(worstColor).toBe('hsl(0, 80%, 55%)'); // Should be Red, not Green
  });
});
