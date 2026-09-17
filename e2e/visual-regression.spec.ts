import { test, expect } from './fixtures/virtual-drummer';
import type { Page } from '@playwright/test';
import { enterApp } from './helpers';
import { getDrill } from '../src/data/registry';
import type { DrillNote } from '../src/data/types';
import { DRUM_TYPE_TO_MIDI } from '../src/data/utils';

/**
 * T-056 — visual regression across the three supported widths.
 *
 * Nothing checked that the app renders correctly at any width but the one the
 * developer happened to have, and the drummer reads this from 1.5–2.5 metres
 * away on a screen mounted near a kit — a viewing distance nobody has designed
 * against by eye.
 *
 * Viewports are set with `setViewportSize` inside the spec rather than by adding
 * Playwright projects: `playwright.config.ts` is not this task's to change, and
 * three projects would triple the whole suite rather than these five captures.
 *
 * **On baselines and platforms.** Playwright suffixes snapshots with the
 * platform, so these live alongside each other — `…-product-linux.png` and
 * `…-product-win32.png` are different files. Baselines committed from one OS
 * therefore do **not** serve another: on a machine seeing this spec for the
 * first time the run writes its own baselines and reports a failure saying so,
 * and the second run is green. That is expected once per platform, and it is
 * not a regression. Font rasterisation differs enough between Windows and Linux
 * that a shared baseline could only be made to pass by loosening the threshold,
 * which R3 forbids.
 */

interface Viewport {
  name: string;
  width: number;
  height: number;
}

/**
 * Ultrawide first because it is the owner's own display class and the one where
 * a centred layout is most likely to strand content at the edges. Tablet is
 * 1280×800 landscape: Android only — Web MIDI does not exist in WebKit, so there
 * is no iPad target at any point in V1 (D5).
 */
const VIEWPORTS: Viewport[] = [
  { name: 'ultrawide', width: 3440, height: 1440 },
  { name: 'standard', width: 1920, height: 1080 },
  { name: 'tablet', width: 1280, height: 800 },
];

/** The drill these captures use. Short, and the default the app opens on. */
const DRILL_ID = 'dynamics-gate-drill-1';

/**
 * Play the drill's sequence exactly on the grid, the way the audit's PERFECT run
 * does, so the result screen shows a pass rather than whatever a silent kit
 * scores. Kept local rather than imported: `drill-audit.spec.ts` owns its copy,
 * and a shared helper would let a change made for the audit silently rewrite
 * what these snapshots photograph.
 */
async function playPerfectRun(page: Page, drillId: string): Promise<void> {
  const drill = getDrill(drillId)!;

  await page.evaluate(() => {
    (window as any).__drillStart = new Promise<number>((resolve) => {
      const handler = (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.phase === 'playing' && typeof d.startPerfMs === 'number') {
          window.removeEventListener('itp-drill-phase', handler);
          resolve(d.startPerfMs);
        } else if (d.phase === 'idle' || d.phase === 'complete') {
          // Never reached 'playing' — an engine stall during count-in. Settle so
          // the caller fails on a missing result rather than hanging here.
          window.removeEventListener('itp-drill-phase', handler);
          resolve(-1);
        }
      };
      window.addEventListener('itp-drill-phase', handler);
    });
  });

  await page.getByTestId('drill-start').click();

  await page.evaluate(
    async ({ sequence, drumTypeToMidi, bpm }: { sequence: DrillNote[]; drumTypeToMidi: Record<string, number>; bpm: number }) => {
      const start: number = await (window as any).__drillStart;
      const vd = (window as any).__virtualDrummer;
      if (start === -1) return;

      for (const note of sequence) {
        const sixteenthMs = 60000 / bpm / 4;
        const gridMs = Math.round(note.targetTimeMs / sixteenthMs) * sixteenthMs;
        const targetPerfMs = start + gridMs;
        const waitFor = targetPerfMs - performance.now() - 5;
        if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));

        const range = note.velocityRange ?? (note.isAccent ? { min: 90, max: 127 } : { min: 40, max: 85 });
        const vel = Math.floor((range.min + range.max) / 2);

        if (note.drumType === 'hihat-chick') {
          vd.cc(4, 0, targetPerfMs - 100);
          vd.hit(44, vel, targetPerfMs);
          vd.cc(4, 127, targetPerfMs);
        } else if (note.drumType === 'hihat-open') {
          vd.cc(4, 0, targetPerfMs - 100);
          vd.hit(drumTypeToMidi[note.drumType] || 46, vel, targetPerfMs);
        } else if (note.drumType === 'hihat-closed') {
          vd.cc(4, 127, targetPerfMs - 100);
          vd.hit(drumTypeToMidi[note.drumType] || 42, vel, targetPerfMs);
        } else {
          const midiNote = drumTypeToMidi[note.drumType];
          if (midiNote) vd.hit(midiNote, vel, targetPerfMs);
        }
      }
    },
    { sequence: drill.sequence, drumTypeToMidi: DRUM_TYPE_TO_MIDI, bpm: drill.bpm }
  );
}

for (const vp of VIEWPORTS) {
  test.describe(`Visual regression — ${vp.name} ${vp.width}×${vp.height}`, () => {
    test.beforeEach(async ({ page, injectVirtualDrummer }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await injectVirtualDrummer();
    });

    test(`the five screens a drummer passes through`, async ({ page }) => {
      // Two real drills play in this test, each count-in plus sequence in real
      // time, at three viewports.
      test.setTimeout(180_000);

      // ---- 1. Session entry, awaiting the activation tap -------------------
      await page.goto(`/?drill=${DRILL_ID}`);
      const warmup = page.getByTestId('engine-warmup');
      await expect(warmup).toHaveAttribute('data-phase', /awaiting-(tap|kit)/, { timeout: 15000 });

      // Only photograph the tap step when it is the step being shown. Autoplay
      // may be granted (an installed PWA, or media-engagement history), in which
      // case entry legitimately opens on the kit step and there is no tap screen
      // to capture — asserting one exists would be asserting the browser's
      // policy rather than our layout.
      if ((await warmup.getAttribute('data-phase')) === 'awaiting-tap') {
        await expect(page).toHaveScreenshot(`${vp.name}-1-warmup-awaiting-tap.png`, {
          animations: 'disabled',
        });
      }

      await enterApp(page);

      // ---- 2. The drill at rest, before Start ------------------------------
      const startButton = page.getByTestId('drill-start');
      await expect(startButton).toBeVisible({ timeout: 10000 });
      await expect(page).toHaveScreenshot(`${vp.name}-2-drill-at-rest.png`, {
        animations: 'disabled',
      });

      // ---- 3. The QuickMenu, with the focus ring on a drill ----------------
      // The menu is open by default and hides only while a drill plays, so this
      // is captured before starting rather than after — after the drill the
      // result screen is also on top, and the capture would be screen 5 again
      // with a menu beside it.
      //
      // Focus is moved with the same `stick-scroll-down` event the navigation
      // controller emits, polling until it lands rather than assuming a fixed
      // number of steps: the progression system injects a "Next Up" item, so
      // the drill's index is not constant.
      const quickMenu = page.getByTestId('quick-menu-panel');
      await expect(quickMenu).toBeVisible({ timeout: 10000 });
      await expect
        .poll(
          async () => {
            await page.evaluate(() =>
              window.dispatchEvent(new window.CustomEvent('stick-scroll-down'))
            );
            return page
              .locator(`[data-testid="menu-item-${DRILL_ID}"]`)
              .evaluate((el) => el.classList.contains('focused'));
          },
          { timeout: 10000, message: 'stick focus never reached the Dynamics Gate drill' }
        )
        .toBeTruthy();
      await expect(page).toHaveScreenshot(`${vp.name}-3-quickmenu-focused.png`, {
        animations: 'disabled',
      });

      // ---- 4. The count-in -------------------------------------------------
      // The digit and the Groove Circle are both genuinely nondeterministic
      // here: which beat the capture lands on depends on when the screenshot is
      // taken, and the circle is running its render loop. Mask both rather than
      // loosen the threshold (R3) — what this snapshot is for is the *layout*
      // around them at each width, which is what 5b.7 asks about.
      await playPerfectRun(page, DRILL_ID);
      const countIn = page.getByTestId('count-in');
      await expect(countIn).toBeVisible({ timeout: 15000 });
      await expect(page).toHaveScreenshot(`${vp.name}-4-count-in.png`, {
        animations: 'disabled',
        mask: [countIn, page.getByTestId('groove-circle-canvas')],
      });

      // ---- 5. The result screen after a completed drill --------------------
      const result = page.getByTestId('drill-result');
      await expect(result).toBeVisible({ timeout: 60000 });
      // The accuracy figure moves with real timing jitter; the verdict and the
      // headline do not, and they are the two lines a drummer reads from the
      // throne, so they stay unmasked deliberately.
      await expect(page).toHaveScreenshot(`${vp.name}-5-result.png`, {
        animations: 'disabled',
        mask: [page.getByTestId('result-accuracy')],
      });

    });
  });
}
