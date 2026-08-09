import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/virtual-drummer';
import { getDrill, DRILL_REGISTRY } from '../src/data/registry';
import { DRUM_TYPE_TO_MIDI } from '../src/data/utils';

/**
 * How far past (or inside) the GREEN edge the audit aims.
 *
 * categoriseTiming treats absDelta <= timingWindowMs as GREEN, so the band
 * boundary IS timingWindowMs. R3 forbids any run within ±5ms of that edge —
 * the original defect was a fixed −40ms hit sitting exactly on Developing's
 * ±40ms window. 10ms clears that exclusion zone and still absorbs the 1–2ms
 * of scheduling jitter that made the boundary case nondeterministic.
 */
const BOUNDARY_EXCLUSION_MS = 5;
const CLEARANCE_MS = 10;

type EarlyKind = 'perfect' | 'acceptable' | 'rushing';

/** Derived early offset in ms. Positive = early. Perfect is on the grid. */
function derivedEarlyMs(timingWindowMs: number, kind: EarlyKind): number {
  if (kind === 'perfect') return 0;
  if (kind === 'acceptable') return timingWindowMs - CLEARANCE_MS;
  return timingWindowMs + CLEARANCE_MS;
}

test.describe('T-005 Drill Audit', () => {
  /**
   * R3 — every derived offset across the registry must sit more than ±5ms
   * from its drill's GREEN boundary. Lives here (not in src/, not in a
   * Vitest file under e2e/) so it runs whenever the audit does.
   */
  test('R3: no audit offset sits within ±5ms of a band boundary', () => {
    expect(CLEARANCE_MS).toBeGreaterThan(BOUNDARY_EXCLUSION_MS);

    for (const entry of DRILL_REGISTRY) {
      const windowMs = entry.unit.passCriteria.timingWindowMs;
      for (const kind of ['perfect', 'acceptable', 'rushing'] as const) {
        const offset = derivedEarlyMs(windowMs, kind);
        const distance = Math.abs(offset - windowMs);
        expect(
          distance,
          `${entry.unit.id} ${kind} offset=${offset}ms is within ±${BOUNDARY_EXCLUSION_MS}ms of band ${windowMs}ms`
        ).toBeGreaterThan(BOUNDARY_EXCLUSION_MS);
      }
    }
  });

  for (const entry of DRILL_REGISTRY) {
    const drillId = entry.unit.id;

    for (const kind of ['perfect', 'acceptable', 'rushing'] as const) {
      const expectPass = kind !== 'rushing';
      const label = kind === 'perfect' ? 'PERFECT' : kind === 'acceptable' ? 'ACCEPTABLE' : 'RUSHING';

      test(`${drillId} - ${label} Run`, async ({ page, injectVirtualDrummer }) => {
        test.setTimeout(120_000);
        await injectVirtualDrummer();

        const drill = getDrill(drillId)!;
        const earlyMs = derivedEarlyMs(drill.passCriteria.timingWindowMs, kind);

        await page.goto(`/?drill=${drillId}`);
        await dismissWarmup(page);
        await expect(page.getByTestId('drill-session')).toBeVisible();

        await page.evaluate(() => {
          (window as any).__drillStart = new Promise<number>((resolve) => {
            const handler = (e: Event) => {
              const d = (e as CustomEvent).detail;
              if (d.phase === 'playing' && typeof d.startPerfMs === 'number') {
                window.removeEventListener('itp-drill-phase', handler);
                resolve(d.startPerfMs);
              }
            };
            window.addEventListener('itp-drill-phase', handler);
          });
        });

        await page.getByTestId('drill-start').click();

        await page.evaluate(async ({ sequence, drumTypeToMidi, bpm, earlyMs }) => {
          const start: number = await (window as any).__drillStart;
          const vd = (window as any).__virtualDrummer;

          for (const note of sequence) {
            const sixteenthMs = 60000 / bpm / 4;
            const gridMs = Math.round(note.targetTimeMs / sixteenthMs) * sixteenthMs;
            const targetPerfMs = start + gridMs - earlyMs;
            const waitFor = targetPerfMs - performance.now() - 5;
            if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));

            const range = note.velocityRange ?? (note.isAccent ? { min: 90, max: 127 } : { min: 40, max: 85 });
            const vel = Math.floor((range.min + range.max) / 2);

            if (note.drumType === 'hihat-chick') {
              vd.cc(4, 0, targetPerfMs - 100);
              vd.cc(4, 127, targetPerfMs);
            } else if (note.drumType === 'hihat-open') {
              vd.cc(4, 0, targetPerfMs - 100);
              vd.hit(drumTypeToMidi[note.drumType] || 46, vel, targetPerfMs);
            } else if (note.drumType === 'hihat-closed') {
              vd.cc(4, 127, targetPerfMs - 100);
              vd.hit(drumTypeToMidi[note.drumType] || 42, vel, targetPerfMs);
            } else {
              const midiNote = drumTypeToMidi[note.drumType];
              if (midiNote) {
                vd.hit(midiNote, vel, targetPerfMs);
              }
            }
          }
        }, {
          sequence: drill.sequence,
          drumTypeToMidi: DRUM_TYPE_TO_MIDI,
          bpm: drill.bpm,
          earlyMs,
        });

        const resultEl = page.getByTestId('drill-result');
        await expect(resultEl).toBeVisible({ timeout: 60000 });

        const passed = await resultEl.getAttribute('data-passed');
        const diagnosis = (await page.getByTestId('result-diagnosis').textContent())?.trim() ?? '';

        let decoupling = 'none';
        try {
          decoupling = (await page.getByTestId('result-decoupling').textContent({ timeout: 1000 }))?.trim() ?? '';
        } catch (e) {}

        if (kind === 'perfect') {
          console.log(`[PERFECT RUN for ${drillId}]: Passed=${passed}, Diagnosis="${diagnosis}", Decoupling=${decoupling}`);
        } else if (kind === 'acceptable') {
          console.log(`[ACCEPTABLE RUN for ${drillId}]: Passed=${passed}, Diagnosis="${diagnosis}", Decoupling=${decoupling}`);
        } else {
          console.log(`[RUSHING RUN for ${drillId}]: Passed=${passed}, Diagnosis="${diagnosis}"`);
        }

        expect(passed, `${label} run for ${drillId} (earlyMs=${earlyMs}, window=${drill.passCriteria.timingWindowMs})`).toBe(
          expectPass ? 'true' : 'false'
        );
      });
    }
  }
});

async function dismissWarmup(page: Page): Promise<void> {
  const warmupOverlay = page.getByTestId('engine-warmup');
  try {
    if (await warmupOverlay.isVisible({ timeout: 2000 })) {
      await warmupOverlay.click();
      await expect(page.getByTestId('warmup-kit')).toBeVisible();
      await page.waitForTimeout(500); // Give effect time to attach listener
      await page.evaluate(() => (window as any).__virtualDrummer.hit(38, 100, performance.now()));
      await expect(warmupOverlay).toBeHidden();
    }
  } catch (e) {}
}
