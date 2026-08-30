import { test, expect } from './fixtures/virtual-drummer';
import { enterApp } from './helpers';
import { MIDI_NOTE } from '../src/audio/midi';

/**
 * Per-drummer dynamics calibration (Release_Plan 7.2).
 *
 * `dynamics-gate-drill-3` and `-5` demand a ghost note in MIDI velocity 15–35
 * and an accent at 90–127, absolutely, on any kit. Those numbers came from one
 * module's factory curve. A drummer whose kit puts a genuine ghost note near
 * 45 fails every one of them while playing correctly.
 *
 * These drive the flow the way a drummer does — by hitting the snare — because
 * the bug that mattered most was only visible that way. A run of eight soft,
 * eight normal and eight hard strokes put sixteen strikes into the soft bucket
 * and left normal empty, and every unit test passed throughout.
 */

const SNARE = MIDI_NOTE.SNARE_HEAD;
const SNARE_RIM = MIDI_NOTE.SNARE_RIM;
/** Mirrors MIN_SAMPLES_PER_INTENT; the counter renders "n / 8". */
const MIN_SAMPLES = 8;

/**
 * Play n strokes clustered around a velocity, waiting for each to register.
 *
 * SYNCHRONISED, not spaced. Earlier versions fired the strikes and then
 * asserted the stage had advanced, which made the test a bet on how fast eight
 * `page.evaluate` round trips complete relative to the app's rendering — 1 in 5
 * at 60ms between strikes, 2 in 5 at 120ms. Widening the gap only moved the
 * odds; nothing about the app was wrong, the test was simply outrunning it.
 *
 * Waiting for the counter to acknowledge each strike removes the race
 * entirely, and reads the way a drummer plays: one, then the next.
 */
async function playLevel(
  page: import('@playwright/test').Page,
  hitDrum: (n: number, v: number) => Promise<void>,
  centre: number,
  n = 8,
) {
  const counter = page.getByTestId('dyn-cal-count');
  for (let i = 0; i < n; i++) {
    // Retry until the strike is acknowledged.
    //
    // The overlay becomes visible before its subscription exists — the hit
    // listener is installed in a useEffect, which Preact runs after paint — so
    // a strike sent the instant the screen appears is dropped. Waiting for
    // visibility is not waiting for readiness, and that one lost strike is the
    // whole of P-13: the level then never reaches eight and the stage never
    // advances.
    //
    // A drummer hitting the moment the prompt appears loses that stroke too.
    // That is a real if minor product wrinkle, recorded separately rather than
    // hidden by this loop — here it just stops the test being a race.
    for (let attempt = 0; attempt < 10; attempt++) {
      await hitDrum(SNARE, centre + ((i % 5) - 2));
      if (i === n - 1) break; // the last strike ends the level; nothing stable to poll
      const settled = await counter
        .textContent()
        .then((t) => t?.startsWith(`${i + 1} `) ?? false)
        .catch(() => false);
      if (settled) break;
      await page.waitForTimeout(120);
    }
    if (i < n - 1) {
      await expect(counter).toHaveText(`${i + 1} / ${MIN_SAMPLES}`, { timeout: 5000 });
    }
  }
}

/**
 * Open the calibrator the way a drummer does — through the settings menu, with
 * sticks.
 *
 * Not by setting the signal from `page.evaluate`: a dynamic import there
 * resolves to a *different* module instance than the app's in Vite's dev
 * graph, so the signal set is not the signal the app reads. Going through the
 * menu also tests the path that actually ships.
 */
async function openCalibrator(
  page: import('@playwright/test').Page,
  hitDrum: (n: number, v: number) => Promise<void>,
  sendCC: (c: number, v: number) => Promise<void>,
) {
  await expect(page.locator('.midi-status-badge')).toContainText('WebMIDI Active', { timeout: 10000 });

  // Hi-hat down, double rim tap opens the menu.
  await sendCC(4, 100);
  await page.waitForTimeout(50);
  await hitDrum(SNARE_RIM, 100);
  await page.waitForTimeout(100);
  await hitDrum(SNARE_RIM, 100);
  await sendCC(4, 0);
  // Clear the 80ms rim debounce before scrolling, or the first scroll is
  // suppressed as an accidental double-trigger.
  await page.waitForTimeout(120);

  const menu = page.locator('.settings-menu-content');
  await expect(menu).toBeVisible({ timeout: 10000 });

  // Scroll until the row is focused rather than counting hits. The row index
  // is not fixed — index 1 (Blind Mode Threshold) is hidden while blind mode
  // is off — and a rim hit inside the 80ms debounce is legitimately dropped,
  // so any fixed count is a race. The menu wraps, so a bounded loop always
  // terminates.
  const focused = menu.locator('.settings-item.focused');
  let found = false;
  for (let i = 0; i < 12; i++) {
    if ((await focused.innerText()).includes('Calibrate Dynamics')) { found = true; break; }
    await hitDrum(SNARE_RIM, 100);
    await page.waitForTimeout(150);
  }
  expect(found, 'never reached the Calibrate Dynamics row').toBe(true);

  await hitDrum(SNARE, 100);
  await expect(page.getByTestId('dynamics-calibrator')).toBeVisible({ timeout: 10000 });
}

test.describe('Dynamics calibration', () => {
  test('three separated levels produce thresholds for this kit', async ({
    page, injectVirtualDrummer, hitDrum, sendCC,
  }) => {
    test.setTimeout(90_000);
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);
    await openCalibrator(page, hitDrum, sendCC);

    const overlay = page.getByTestId('dynamics-calibrator');
    await expect(overlay).toHaveAttribute('data-stage', 'soft');

    // A kit whose ghost note lands near 45 — the case the factory numbers fail.
    await playLevel(page, hitDrum, 45);
    await expect(overlay, 'eight soft strokes must advance to normal').toHaveAttribute('data-stage', 'normal');

    await playLevel(page, hitDrum, 75);
    await expect(overlay, 'and normal must advance to hard, not stay put').toHaveAttribute('data-stage', 'hard');

    await playLevel(page, hitDrum, 108);
    await expect(overlay).toHaveAttribute('data-stage', 'done');

    // The thresholds must sit between the drummer's own clusters.
    const text = await overlay.innerText();
    expect(text).toContain('Calibrated');
  });

  test('refuses to invent a threshold when the levels overlap', async ({
    page, injectVirtualDrummer, hitDrum, sendCC,
  }) => {
    test.setTimeout(90_000);
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);
    await openCalibrator(page, hitDrum, sendCC);

    const overlay = page.getByTestId('dynamics-calibrator');

    // Soft and normal played at essentially the same weight. There is no
    // honest boundary between them, and drawing one would fail the drummer at
    // random — the mistake the decoupling score made for weeks.
    await playLevel(page, hitDrum, 60);
    await playLevel(page, hitDrum, 64);
    await playLevel(page, hitDrum, 108);

    await expect(overlay).toHaveAttribute('data-stage', 'refused');
    await expect(page.getByTestId('dyn-cal-refusal')).toContainText('soft and normal');
  });
});
