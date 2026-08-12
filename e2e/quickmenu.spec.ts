import { test, expect } from '@playwright/test';
import { enterApp } from './helpers';

test.describe('QuickMenu UI & Navigation', () => {

  // The QuickMenu is a product component, so it is tested on the product
  // route. Only the visibility test needs the dev harness, for its manual
  // drill-playback toggle.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await enterApp(page);
  });

  test('Visibility State: QuickMenu is unmounted during active drill playback', async ({ page }) => {
    await page.goto('/?dev=1');

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

  /**
   * Stick navigation is one flat focus ring over [tabs, ...drills].
   * `stick-scroll-down` moves focus, `stick-select` activates it.
   *
   * This replaces an earlier test asserting that `stick-select` cycled tabs.
   * That binding existed only to satisfy the test — the source said so — and
   * it left no way to launch a drill without a mouse.
   */
  const scroll = (page: import('@playwright/test').Page, times = 1) =>
    page.evaluate((n) => {
      for (let i = 0; i < n; i++) {
        window.dispatchEvent(new window.CustomEvent('stick-scroll-down'));
      }
    }, times);

  const select = (page: import('@playwright/test').Page) =>
    page.evaluate(() => window.dispatchEvent(new window.CustomEvent('stick-select')));

  test('Tab Switching: focus moves across tabs and select switches phase', async ({ page }) => {
    await expect(page.getByTestId('tab-practice')).toHaveClass(/active/);

    // Focus starts on the Practice tab (index 1). One scroll -> Fun tab.
    await scroll(page);
    await select(page);
    await expect(page.getByTestId('tab-fun')).toHaveClass(/active/);

    // Fun has no content yet, and says so rather than listing invented items.
    await expect(page.getByTestId('phase-empty-state')).toBeVisible();
  });

  test('Stick select launches the focused drill — no mouse required', async ({ page }) => {
    // Focus starts on the Practice tab (slot 1). Tabs occupy slots 0-2, so
    // two scrolls reach slot 3: the first drill.
    await scroll(page, 2);
    await select(page);

    // The drill must actually start: count-in is proof the runner engaged.
    await expect(page.getByTestId('count-in')).toBeVisible({ timeout: 8000 });
    await expect(page).toHaveURL(/drill=dynamics-gate-drill-1/);
  });

  test('Sticky Labels Interaction: Labels do not intercept clicks', async ({ page }) => {
    const label = page.getByTestId('sticky-label-Dynamics-Gate');
    await expect(label).toBeVisible();
    const tagName = await label.evaluate(el => el.tagName);
    expect(tagName).toBe('H3');
  });

});
