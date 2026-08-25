import { test, expect } from './fixtures/virtual-drummer';
import { enterApp } from './helpers';

/**
 * What happens when the kit goes away mid-drill (T-044, Release_Plan 9.4).
 *
 * These assert outcomes rather than logging them. The first version of this
 * file printed `page.textContent('body')` to the console and asserted nothing,
 * so all three passed while proving nothing — which is the failure mode
 * AGENT_PROTOCOL Rule 1 exists to prevent.
 *
 * The requirement under test is R2: **a drummer must never be given a failing
 * grade for a drill they could not play.** Before this task, a disconnect mid
 * drill ran to completion against silence and reported that they missed every
 * note — the same family as C-2, C-36 and P-6, where the app blamed a drummer
 * for its own fault.
 */

test.describe('Disconnect, backgrounding and hot-plug', () => {
  test('a disconnect mid-drill is reported as a disconnect, not a failed drill', async ({
    page,
    injectVirtualDrummer,
    disconnectKit,
  }) => {
    test.setTimeout(60_000);
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);

    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 15000 });

    await disconnectKit();

    const result = page.getByTestId('drill-result');
    await expect(result).toBeVisible({ timeout: 20000 });

    // Structural, not prose: DrillResult.error is surfaced as data-error
    // precisely so rewording the headline cannot disarm this.
    await expect(result).toHaveAttribute('data-error', 'kit-disconnected');

    // The point of the whole task. Silence must not read as a bad performance.
    await expect(result).toHaveAttribute('data-passed', 'false');
    await expect(page.getByTestId('result-diagnosis')).toContainText('Kit Disconnected');
  });

  test('hiding the tab mid-drill stops the drill instead of grading silence', async ({
    page,
    injectVirtualDrummer,
  }) => {
    test.setTimeout(60_000);
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);

    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 15000 });

    // Browsers suspend AudioContext on hidden tabs. The drill cannot continue,
    // and a drummer cannot rejoin a bar they did not hear — so stopping and
    // saying why beats resuming mid-phrase.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const result = page.getByTestId('drill-result');
    await expect(result).toBeVisible({ timeout: 20000 });
    await expect(result).toHaveAttribute('data-passed', 'false');
    await expect(result).not.toHaveAttribute('data-error', '');
  });

  test('a kit connected after load becomes usable without a reload', async ({
    page,
    injectVirtualDrummer,
    connectKit,
    disconnectKit,
  }) => {
    test.setTimeout(60_000);
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);

    await disconnectKit();
    await connectKit();

    // The kit is back, so a drill must be startable and reach 'playing'.
    // Requiring a reload here would mean a drummer who plugged in late is
    // stuck on a screen that never responds, with nothing telling them why.
    await page.getByTestId('drill-start').click();
    await expect(page.getByTestId('playing')).toBeVisible({ timeout: 15000 });
  });
});
