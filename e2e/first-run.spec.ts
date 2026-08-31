import { test, expect } from './fixtures/virtual-drummer';

import { enterApp } from './helpers';

test.describe('First-run overlays (T-029)', () => {
  test.beforeEach(async ({ injectVirtualDrummer }) => {
    await injectVirtualDrummer();
  });

  test('Placement diagnostic renders and can be skipped', async ({ page }) => {
    await page.goto('/');
    await enterApp(page, { skipFirstRunDismissal: true });
    
    const diag = page.getByTestId('diagnostic-overlay');
    await expect(diag).toBeVisible();
    
    // Click skip
    await diag.getByRole('button', { name: 'Skip' }).click();
    
    // It should be gone, and hi-hat calibration should appear (since we haven't calibrated)
    await expect(diag).toBeHidden();
    await expect(page.getByTestId('hihat-calibration-overlay')).toBeVisible();
  });

  test('Hi-hat calibration renders and can be completed', async ({ page }) => {
    await page.goto('/');
    await enterApp(page, { skipFirstRunDismissal: true });
    
    // Skip diagnostic to reach hi-hat
    const diag = page.getByTestId('diagnostic-overlay');
    await expect(diag).toBeVisible();
    await diag.getByRole('button', { name: 'Skip' }).click();
    
    const hihat = page.getByTestId('hihat-calibration-overlay');
    await expect(hihat).toBeVisible();
    
    // Step 0: Start
    await hihat.getByTestId('calibrate-next-btn').click();
    
    // Step 1: Confirm (Open)
    await expect(hihat.getByText(/COMPLETELY OFF/i)).toBeVisible();
    await hihat.getByTestId('calibrate-next-btn').click();
    
    // Step 2: Confirm (Closed)
    await expect(hihat.getByText(/FIRMLY DOWN/i)).toBeVisible();
    await hihat.getByTestId('calibrate-next-btn').click();
    
    // It should disappear
    await expect(hihat).toBeHidden();
  });
});
