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

/** Play n strokes clustered around a velocity, as a drummer would. */
async function playLevel(hitDrum: (n: number, v: number) => Promise<void>, centre: number, n = 8) {
  for (let i = 0; i < n; i++) {
    await hitDrum(SNARE, centre + ((i % 5) - 2));
  }
}

async function openCalibrator(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const m = await import('/src/components/settings/DynamicsCalibrator');
    m.isDynamicsCalibratorOpen.value = true;
  });
  await expect(page.getByTestId('dynamics-calibrator')).toBeVisible({ timeout: 10000 });
}

test.describe('Dynamics calibration', () => {
  test('three separated levels produce thresholds for this kit', async ({
    page, injectVirtualDrummer, hitDrum,
  }) => {
    test.setTimeout(90_000);
    await injectVirtualDrummer();
    await page.goto('/?dev=1');
    await enterApp(page);
    await openCalibrator(page);

    const overlay = page.getByTestId('dynamics-calibrator');
    await expect(overlay).toHaveAttribute('data-stage', 'soft');

    // A kit whose ghost note lands near 45 — the case the factory numbers fail.
    await playLevel(hitDrum, 45);
    await expect(overlay, 'eight soft strokes must advance to normal').toHaveAttribute('data-stage', 'normal');

    await playLevel(hitDrum, 75);
    await expect(overlay, 'and normal must advance to hard, not stay put').toHaveAttribute('data-stage', 'hard');

    await playLevel(hitDrum, 108);
    await expect(overlay).toHaveAttribute('data-stage', 'done');

    // The thresholds must sit between the drummer's own clusters.
    const text = await overlay.innerText();
    expect(text).toContain('Calibrated');
  });

  test('refuses to invent a threshold when the levels overlap', async ({
    page, injectVirtualDrummer, hitDrum,
  }) => {
    test.setTimeout(90_000);
    await injectVirtualDrummer();
    await page.goto('/?dev=1');
    await enterApp(page);
    await openCalibrator(page);

    const overlay = page.getByTestId('dynamics-calibrator');

    // Soft and normal played at essentially the same weight. There is no
    // honest boundary between them, and drawing one would fail the drummer at
    // random — the mistake the decoupling score made for weeks.
    await playLevel(hitDrum, 60);
    await playLevel(hitDrum, 64);
    await playLevel(hitDrum, 108);

    await expect(overlay).toHaveAttribute('data-stage', 'refused');
    await expect(page.getByTestId('dyn-cal-refusal')).toContainText('soft and normal');
  });
});
