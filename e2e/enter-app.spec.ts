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

/**
 * Decision D5 — a browser without Web MIDI must say so.
 *
 * Web MIDI does not exist in WebKit, so it is missing in Safari and in every
 * browser on iOS and iPadOS. Before this the app reached the kit step, listened
 * to a MIDI stack that could never deliver anything, and after six seconds
 * offered "No kit connected — continue anyway" — sending someone to check a
 * cable for a limitation of their browser.
 *
 * The capability is removed rather than mocked, which is as close to Safari as
 * a Chromium run can get: `isWebMidiSupported` asks `navigator` the same
 * question either browser answers.
 */
test('a browser without Web MIDI names the real problem instead of blaming the kit', async ({ page }) => {
  // Deliberately no virtual drummer: that fixture installs the very API this
  // test needs absent.
  await page.addInitScript(() => {
    // Removed from the prototype, which is where it actually lives. Deleting
    // `navigator.requestMIDIAccess` removes an own property that was never
    // there and silently leaves the real one in place — the browser then
    // reaches the API and fails on *permission* instead, which is a different
    // condition with a different remedy.
    delete (Navigator.prototype as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  });

  await page.goto('/');

  const warmup = page.getByTestId('engine-warmup');
  await expect(warmup).toHaveAttribute('data-phase', /awaiting-(tap|kit)/, { timeout: 15000 });
  if ((await warmup.getAttribute('data-phase')) === 'awaiting-tap') {
    await warmup.click();
  }
  await expect(warmup).toHaveAttribute('data-phase', 'awaiting-kit', { timeout: 10000 });

  // The message names the browser, and never asks for a snare hit that cannot
  // be heard.
  await expect(page.getByTestId('warmup-unsupported')).toBeVisible();
  await expect(page.getByTestId('warmup-kit')).toHaveCount(0);

  // And the way forward is offered at once rather than after the six-second
  // wait for a kit that could never answer.
  await expect(page.getByTestId('warmup-skip')).toBeVisible({ timeout: 2000 });
});
