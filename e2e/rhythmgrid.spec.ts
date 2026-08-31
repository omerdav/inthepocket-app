import { test, expect } from './fixtures/virtual-drummer';

import { enterApp } from './helpers';

test.describe('RhythmGrid Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-1');
    await enterApp(page);
  });

  test('G5 - Playhead Alignment', async ({ page }) => {
    // We rely on dynamics-gate-drill-1. Its first note is at 0ms.
    // Force internal mock clock to 0ms. Assert playhead X matches note X exactly.
    await page.evaluate(() => {
      // Mock clock
      document.querySelector('[data-testid="rhythm-grid-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-correlator-mock', { detail: { timeMs: 0 } }));
    });

    await page.waitForTimeout(100);

    // Instead of querying internal state which might not be exposed,
    // we can use the E2E rhythm grid context to find where things are drawn,
    // or query the window if they expose note coordinates.
    // Let's assume the dev team provides __E2E_GET_PLAYHEAD_X__() and __E2E_GET_NOTE_X__(time)
    // Or we just evaluate a boolean if they wrote a helper.
    // For now we'll do our best:
    const isAligned = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="rhythm-grid-canvas"]') as HTMLElement;
      if (!canvas || canvas.dataset.playheadX === undefined || canvas.dataset.noteX === undefined) {
        return false;
      }
      return parseFloat(canvas.dataset.playheadX) === parseFloat(canvas.dataset.noteX);
    });
    expect(isAligned).toBe(true);
  });

  test('G6 - Sticking Cue Snapshot', async ({ page }) => {
    const canvas = page.locator('canvas').last();
    
    // Freeze the clock at 375ms so the snare note (which has a sticking 'L') is exactly on the playhead.
    // dynamics-gate-drill-1 has its second note (L) at 375ms.
    await page.evaluate(() => {
      document.querySelector('[data-testid="rhythm-grid-canvas"]')?.dispatchEvent(new window.CustomEvent('itp-correlator-mock', { detail: { timeMs: 375 } }));
    });
    
    await page.waitForTimeout(100);

    // Baseline screenshot 'inside' sticking cue
    await page.evaluate(async () => {
      if ((window as any).setStickingCuePlacement) {
        (window as any).setStickingCuePlacement('inside');
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // double RAF for safety
    });
    const insideBuffer = await canvas.screenshot();

    // Switch to 'underneath'
    await page.evaluate(async () => {
      if ((window as any).setStickingCuePlacement) {
        (window as any).setStickingCuePlacement('underneath');
      }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // double RAF for safety
    });
    const underneathBuffer = await canvas.screenshot();

    // Assert screenshots differ physically
    expect(insideBuffer.compare(underneathBuffer)).not.toBe(0);
  });

  test('R-T2: Grid is in a stable resting state (not scrolling) before start', async ({ page }) => {
    // We rely on dynamics-gate-drill-1 sequence already injected via the drill session.
    // The drill has not started, so no correlator and no startPerfMs.
    // The first note should be drawn at a stable X coordinate.
    await page.waitForTimeout(100);

    const getNoteX = () => page.evaluate(() => parseFloat((document.querySelector('[data-testid="rhythm-grid-canvas"]') as HTMLElement)?.dataset.noteX || '-1'));

    const firstX = await getNoteX();
    expect(firstX).not.toBe(-1); // Ensure it is rendered

    await page.waitForTimeout(300);

    const secondX = await getNoteX();
    expect(secondX).toBe(firstX); // Should not have moved
  });

  test('R-T3: Canvas internal resolution tracks its container width', async ({ page }) => {
    const canvas = page.locator('[data-testid="rhythm-grid-canvas"]');
    
    const initialWidth = await canvas.evaluate((node: HTMLCanvasElement) => node.width);
    expect(initialWidth).toBeGreaterThan(0);
    
    await page.evaluate(() => {
      const c = document.querySelector('[data-testid="rhythm-grid-canvas"]');
      if (c && c.parentElement) {
        c.parentElement.style.width = '400px';
        c.parentElement.style.maxWidth = '400px';
      }
    });
    
    // Poll rather than waiting a fixed 100ms. The write is now deferred to
    // requestAnimationFrame, and a frame is not guaranteed inside any
    // particular wall-clock window — that is precisely the assumption that
    // made P-5 flake for five sessions (T-034). Do not reintroduce it here.
    await expect
      .poll(async () => canvas.evaluate((node: HTMLCanvasElement) => node.width), { timeout: 2000 })
      .toBe(400);
  });
});
