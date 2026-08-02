import { test, expect } from '@playwright/test';

test.describe('Independence Gate (Decoupling Score)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Bypassed calibration due to navigator.webdriver check in app.tsx
  });

  test('fails graduation if foot is perfectly dependent on hand (r = 1.0)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Create a perfect 100% GREEN timing score
      const timing = new Int8Array([0, 0, 0, 0, 0, 0, 0, 0]);
      // Perfect dynamics
      const dynamics = new Int8Array([1, 1, 1, 1, 1, 1, 1, 1]);
      // Dummy diagnostics
      const diagnostics = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
      
      // Decoupling score of 1.0 = perfect dependence (hand mimicking foot completely)
      return (window as any).__E2E_EVALUATE_DRILL5__(timing, dynamics, diagnostics, 1.0);
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('foot is following your hand');
  });

  test('passes graduation if decoupling threshold is met (r = 0.2)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Create a perfect 100% GREEN timing score
      const timing = new Int8Array([0, 0, 0, 0, 0, 0, 0, 0]);
      // Perfect dynamics
      const dynamics = new Int8Array([1, 1, 1, 1, 1, 1, 1, 1]);
      // Dummy diagnostics
      const diagnostics = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
      
      // Decoupling score of 0.2 = well below 0.4 threshold
      return (window as any).__E2E_EVALUATE_DRILL5__(timing, dynamics, diagnostics, 0.2);
    });

    expect(result.passed).toBe(true);
    expect(result.message).toBe('Passed.');
  });
});
