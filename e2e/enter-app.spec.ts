import { test, expect } from './fixtures/virtual-drummer';
import { enterApp, awaitEntryState } from './helpers';

/**
 * Register P-19 — `enterApp` must not read "the warmup screen is not on the
 * page" as "we are already inside the app".
 *
 * The original defect was a race, and races do not reproduce on demand: it
 * failed three tests of 96 in one full suite and none in the next. So this spec
 * does not wait for the race to happen — **it holds the race open.** The app's
 * entry module is delayed, which guarantees the page is blank at the exact
 * moment `enterApp` inspects it. That is the losing condition, made certain.
 *
 * Against the old `warmup.count() === 0` check these tests fail every time:
 * the helper concludes session entry is already complete, never performs the
 * tap or the kit confirmation, and then waits for a `drill-session` that
 * nothing will ever render.
 */

/** Hold the page blank for long enough that no instantaneous check can pass. */
async function delayAppBundle(page: import('@playwright/test').Page, ms = 1500) {
  await page.route('**/src/main.tsx', async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test('enterApp waits for the app to paint instead of assuming it is already inside', async ({
  page,
  injectVirtualDrummer,
}) => {
  await injectVirtualDrummer();
  await delayAppBundle(page);

  // waitUntil 'commit' returns as soon as navigation commits, before the
  // delayed module has run. A default goto waits for load, which closes the
  // very race this test exists to hold open.
  await page.goto('/', { waitUntil: 'commit' });

  // No settling wait here on purpose. Inspecting immediately is the whole point.
  await enterApp(page);

  await expect(page.getByTestId('drill-session')).toBeVisible();
});

test('awaitEntryState reports warmup, not "inside", while the page is still blank', async ({
  page,
  injectVirtualDrummer,
}) => {
  await injectVirtualDrummer();
  await delayAppBundle(page);

  // waitUntil 'commit' returns as soon as navigation commits, before the
  // delayed module has run. A default goto waits for load, which closes the
  // very race this test exists to hold open.
  await page.goto('/', { waitUntil: 'commit' });

  // The narrower claim, stated on its own so a failure says which half broke:
  // the app has not painted, and the honest answer is still "warmup".
  expect(await awaitEntryState(page)).toBe('warmup');
});
