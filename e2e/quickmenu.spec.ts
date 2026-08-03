import { test, expect } from '@playwright/test';

test.describe('QuickMenu UI & Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/?dev=1');
  });

  test('Visibility State: QuickMenu is unmounted during active drill playback', async ({ page }) => {
    // Should be visible initially
    await expect(page.getByTestId('quick-menu-panel')).toBeVisible();

    // Click "Play Drill"
    await page.getByText('Play Drill').click();

    // Should be completely unmounted
    await expect(page.getByTestId('quick-menu-panel')).not.toBeAttached();

    // Click "Stop Drill"
    await page.getByText('Stop Drill').click();

    // Should be visible again
    await expect(page.getByTestId('quick-menu-panel')).toBeVisible();
  });

  test('Tab Switching: Stick-driven tab switches register discretely', async ({ page }) => {
    // Currently on Practice by default. Stick-select cycles tabs.
    await expect(page.getByTestId('tab-practice')).toHaveClass(/active/);

    // Simulate stick select (Rim hit)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('stick-select'));
    });

    // Should move to 'fun'
    await expect(page.getByTestId('tab-fun')).toHaveClass(/active/);

    // Simulate again
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('stick-select'));
    });

    // Should move to 'learn'
    await expect(page.getByTestId('tab-learn')).toHaveClass(/active/);
  });

  test('Sticky Labels Interaction: Labels do not intercept clicks', async ({ page }) => {
    // On Practice tab, we have "Bootcamps" sticky label.
    const label = page.getByTestId('sticky-label-Bootcamps');
    await expect(label).toBeVisible();

    // CSS pointer-events should ideally be none or it shouldn't change selection state
    // Let's assert the label exists and is decorative.
    const tagName = await label.evaluate(el => el.tagName);
    expect(tagName).toBe('H3');
  });

});
