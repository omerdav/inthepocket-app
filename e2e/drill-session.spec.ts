import { test, expect } from './fixtures/virtual-drummer';
import { enterApp } from './helpers';

/**
 * M5 — the vertical slice, end to end.
 *
 * A real drill is selected, played against the real metronome, scored by the
 * real worker against the audio clock, and a specific diagnosis is rendered.
 * Nothing here calls a scoring function directly: the assertions are on what a
 * drummer would see on screen after playing.
 *
 * Hit *timestamps* are supplied explicitly (as real MIDI hardware does) so the
 * measurement is not at the mercy of the test runner's scheduler. Everything
 * else — collection, correlation, matching, grading, diagnosis, render — is the
 * production path.
 */

const SNARE_HEAD = 38;
const NOTE_COUNT = 16;      // 2 bars of eighths
const NOTE_SPACING_MS = 375; // 80 BPM eighths
const ACCENT_EVERY = 8;      // one accent per bar

test.describe.configure({ mode: 'serial' });

/**
 * Play the drill with a per-note velocity/offset strategy and return what the
 * result screen says.
 */
async function playDrill(
  page: import('@playwright/test').Page,
  strategy: { velocity: (i: number) => number; offsetMs?: (i: number) => number }
) {
  // Capture the real drill-start time from the app's own phase event.
  await page.evaluate(() => {
    (window as any).__drillStart = new Promise<number>((resolve) => {
      window.addEventListener('itp-drill-phase', (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.phase === 'playing' && typeof d.startPerfMs === 'number') resolve(d.startPerfMs);
      });
    });
  });

  await page.getByTestId('drill-start').click();

  await page.evaluate(
    async ({ count, spacing, accentEvery, velTable, offTable }) => {
      const start: number = await (window as any).__drillStart;
      const vd = (window as any).__virtualDrummer;

      for (let i = 0; i < count; i++) {
        const targetPerfMs = start + i * spacing;
        const intended = targetPerfMs + (offTable[i] ?? 0);
        // Wait until the note is genuinely due, so hits stream in during the
        // collection window rather than arriving in one burst.
        const waitFor = targetPerfMs - performance.now() - 5;
        if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
        vd.hit(38, velTable[i], intended);
      }
      void accentEvery;
    },
    {
      count: NOTE_COUNT,
      spacing: NOTE_SPACING_MS,
      accentEvery: ACCENT_EVERY,
      velTable: Array.from({ length: NOTE_COUNT }, (_, i) => strategy.velocity(i)),
      offTable: Array.from({ length: NOTE_COUNT }, (_, i) => strategy.offsetMs?.(i) ?? 0),
    }
  );

  const result = page.getByTestId('drill-result');
  await expect(result).toBeVisible({ timeout: 15000 });

  return {
    passed: await result.getAttribute('data-passed'),
    diagnosis: (await page.getByTestId('result-diagnosis').textContent())?.trim() ?? '',
    accuracy: (await page.getByTestId('result-accuracy').textContent())?.trim() ?? '',
  };
}

test.beforeEach(async ({ page, injectVirtualDrummer }) => {
  await injectVirtualDrummer();
  await page.goto('/');
  await enterApp(page);
});

test('the product screen shows a real drill, not a debug harness', async ({ page }) => {
  await expect(page.getByTestId('drill-name')).toHaveText(/Dynamics Gate.*Even Single Strokes/);
  await expect(page.getByTestId('drill-start')).toBeVisible();
  // The emoji pad grid and event feed must not be on the product path.
  await expect(page.locator('.pads-card')).toHaveCount(0);
  await expect(page.locator('.hit-log-footer')).toHaveCount(0);
});

test('counts in on the click before the drill starts', async ({ page }) => {
  await page.getByTestId('drill-start').click();
  await expect(page.getByTestId('count-in')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });
});

test('Groove Circle is visible during playing and reflects live hits', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__drillStart = new Promise<number>((resolve) => {
      window.addEventListener('itp-drill-phase', (e: Event) => {
        const d = (e as CustomEvent).detail;
        if (d.phase === 'playing' && typeof d.startPerfMs === 'number') resolve(d.startPerfMs);
      });
    });
  });

  await page.getByTestId('drill-start').click();
  await expect(page.getByTestId('playing')).toBeVisible({ timeout: 10000 });
  
  const canvas = page.locator('.groove-circle-container canvas');
  await expect(canvas).toBeVisible();

  const greenColor = await page.evaluate(async () => {
    const start: number = await (window as any).__drillStart;
    const vd = (window as any).__virtualDrummer;
    vd.hit(38, 100, start);
    await new Promise(r => setTimeout(r, 50));
    return (window as any).__E2E_LAST_HIT_COLOR__;
  });
  expect(greenColor).toBe('hsl(142, 76%, 45%)');
});

test('a clean performance passes and reports being in the pocket', async ({ page }) => {
  test.setTimeout(60000);
  const r = await playDrill(page, {
    // Accents in the 90-127 band, the rest in the 40-85 normal band.
    velocity: (i) => (i % ACCENT_EVERY === 0 ? 105 : 62),
  });

  expect(r.passed).toBe('true');
  expect(r.diagnosis).toBe('In the pocket.');
  expect(r.accuracy).toContain('100%');
});

test('playing everything too quietly fails, and says why', async ({ page }) => {
  test.setTimeout(60000);
  const r = await playDrill(page, {
    velocity: () => 25, // below the normal band, far below the accent band
  });

  expect(r.passed).toBe('false');
  // The product requirement: name the fault, do not report a percentage.
  expect(r.diagnosis).toMatch(/accents.*aren't cutting through/i);
  expect(r.diagnosis).toMatch(/beat/i);
});

test('consistently early hits are diagnosed as rushing', async ({ page }) => {
  test.setTimeout(60000);
  const r = await playDrill(page, {
    velocity: (i) => (i % ACCENT_EVERY === 0 ? 105 : 62),
    offsetMs: () => -40, // inside the drill's 50ms window, but clearly early
  });

  // 40ms early still clears this drill's tolerance, so the gate passes —
  // but the app must still tell the drummer about the habit.
  expect(r.diagnosis).toMatch(/ahead of the click/i);
});

test('R2: the quick menu is reachable after an audio stall during count-in', async ({ page }) => {
  test.setTimeout(30000);
  
  // Inject the stall by freezing the audio context's time
  await page.evaluate(() => {
    let frozen = false;
    const orig = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime');
    if (orig) {
      Object.defineProperty(BaseAudioContext.prototype, 'currentTime', {
        get: function() {
          if (frozen) return 0;
          return orig.get!.call(this);
        }
      });
      (window as any).freezeAudioContext = () => { frozen = true; };
    }
  });

  // Register a listener to freeze it precisely when the 'count-in' phase starts
  await page.evaluate(() => {
    window.addEventListener('itp-drill-phase', (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.phase === 'count-in') {
        (window as any).freezeAudioContext?.();
      }
    });
  });
  
  await page.getByTestId('drill-start').click();

  // Wait for the result screen to appear due to the stall
  const result = page.getByTestId('drill-result');
  await expect(result).toBeVisible({ timeout: 10000 });
  const errorAttr = await result.getAttribute('data-error');
  expect(errorAttr).toBe('audio-stall');

  // Verify that isDrillPlaying returned to false by checking if quick menu is accessible
  // The quick menu is usually closed when playing.
  const menu = page.getByTestId('quick-menu-panel');
  await expect(menu).toBeVisible();
});
