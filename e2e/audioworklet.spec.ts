import { test, expect } from '@playwright/test';

/**
 * M4 — audio engine verification.
 *
 * These replace two tests that asserted `expect(true).toBe(true)` and passed
 * whether or not an audio engine existed. Every assertion below is on a value
 * measured from rendered audio samples or read from shared memory; break the
 * processor and these go red.
 *
 * The metronome is rendered through an OfflineAudioContext so timing is
 * deterministic and not subject to CI machine load.
 */

/** Render the real worklet in-page and return measured onsets. */
async function render(
  page: import('@playwright/test').Page,
  opts: { bpm: number; beatsPerBar?: number; durationSec?: number }
) {
  return page.evaluate(async (o) => {
    const { renderMetronome } = await import('/src/audio/metronomeAnalysis.ts');
    const r = await renderMetronome(o);
    // Structured-clone friendly.
    return {
      onsets: r.onsets.map((x) => ({ timeSec: x.timeSec, peak: x.peak })),
      intervalsMs: r.intervalsMs,
      overallPeak: r.overallPeak,
    };
  }, opts);
}

test.describe('M4 — Audio engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the page is cross-origin isolated, so SharedArrayBuffer exists', async ({ page }) => {
    const iso = await page.evaluate(() => ({
      crossOriginIsolated: self.crossOriginIsolated,
      sab: typeof SharedArrayBuffer,
    }));
    // Without this the whole timing bridge is unavailable at runtime.
    expect(iso.crossOriginIsolated).toBe(true);
    expect(iso.sab).toBe('function');
  });

  test('the metronome actually produces audio', async ({ page }) => {
    const r = await render(page, { bpm: 120, durationSec: 2 });
    // A processor that never writes to `outputs` renders pure silence.
    expect(r.overallPeak).toBeGreaterThan(0.01);
  });

  test('clicks land on the beat grid at 120 BPM', async ({ page }) => {
    const r = await render(page, { bpm: 120, durationSec: 4 });

    expect(r.onsets.length).toBeGreaterThanOrEqual(7);

    // First beat at the 100ms start delay.
    expect(r.onsets[0].timeSec).toBeCloseTo(0.1, 2);

    // Every interval within 2ms of 500ms.
    for (const iv of r.intervalsMs) {
      expect(Math.abs(iv - 500)).toBeLessThan(2);
    }
  });

  test('tempo is honoured, not hardcoded', async ({ page }) => {
    // The previous processor hardcoded `currentTime + 0.5` (120 BPM) and
    // ignored tempo entirely. This fails outright against that.
    for (const [bpm, expectedMs] of [[60, 1000], [200, 300]] as const) {
      const r = await render(page, { bpm, durationSec: 3 });
      expect(r.intervalsMs.length).toBeGreaterThan(0);
      const mean = r.intervalsMs.reduce((a, b) => a + b, 0) / r.intervalsMs.length;
      expect(Math.abs(mean - expectedMs)).toBeLessThan(2);
    }
  });

  test('does not drift over a sustained render', async ({ page }) => {
    const r = await render(page, { bpm: 120, durationSec: 20 });
    expect(r.onsets.length).toBeGreaterThanOrEqual(38);

    // Compare the last onset against where the grid says it must be.
    const last = r.onsets[r.onsets.length - 1];
    const expected = 0.1 + (r.onsets.length - 1) * 0.5;
    expect(Math.abs(last.timeSec - expected) * 1000).toBeLessThan(2);
  });

  test('beat 1 is accented above the rest of the bar', async ({ page }) => {
    const r = await render(page, { bpm: 120, beatsPerBar: 4, durationSec: 4 });
    const downbeats = r.onsets.filter((_, i) => i % 4 === 0).map((o) => o.peak);
    const others = r.onsets.filter((_, i) => i % 4 !== 0).map((o) => o.peak);
    expect(downbeats.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);

    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(downbeats)).toBeGreaterThan(mean(others) * 1.2);
  });

  test('the live AudioContext loads the worklet and publishes the beat grid', async ({ page }) => {
    // Exercises the real-context path (addModule + AudioWorkletNode + SAB),
    // which is separate code from the offline render above.
    const result = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/audio/AudioEngine.ts');
      const { SAB_NEXT_BEAT_NS, SAB_PERIOD_NS, SAB_RUNNING } = await import(
        '/src/audio/metronomeSab.ts'
      );
      await audioEngine.init();
      audioEngine.start(120, 4);
      await new Promise((r) => setTimeout(r, 400));

      const v = audioEngine.view!;
      return {
        running: Number(Atomics.load(v, SAB_RUNNING)),
        periodSec: Number(Atomics.load(v, SAB_PERIOD_NS)) / 1e9,
        nextBeatSec: Number(Atomics.load(v, SAB_NEXT_BEAT_NS)) / 1e9,
        ctxTime: audioEngine.context!.currentTime,
      };
    });

    expect(result.running).toBe(1);
    expect(result.periodSec).toBeCloseTo(0.5, 3);
    // The published beat must be in the future — that is what makes it a
    // usable lookahead reference rather than a stale past value.
    expect(result.nextBeatSec).toBeGreaterThan(result.ctxTime);
    expect(result.nextBeatSec - result.ctxTime).toBeLessThanOrEqual(0.51);
  });

  test('hit offsets fold to the nearest beat', async ({ page }) => {
    const deltas = await page.evaluate(async () => {
      const { audioEngine } = await import('/src/audio/AudioEngine.ts');
      const { nearestBeatDeltaMs, SAB_NEXT_BEAT_NS, SAB_PERIOD_NS } = await import(
        '/src/audio/metronomeSab.ts'
      );
      await audioEngine.init();
      audioEngine.start(120, 4);
      await new Promise((r) => setTimeout(r, 300));

      const v = audioEngine.view!;
      const beat = Number(Atomics.load(v, SAB_NEXT_BEAT_NS)) / 1e9;
      const period = Number(Atomics.load(v, SAB_PERIOD_NS)) / 1e9;
      return {
        onBeat: nearestBeatDeltaMs(v, beat),
        early20: nearestBeatDeltaMs(v, beat - 0.02),
        late20: nearestBeatDeltaMs(v, beat + 0.02),
        // Regression guard: just-after-a-beat must read slightly late,
        // not almost a whole period early.
        justLate: nearestBeatDeltaMs(v, beat + 3 * period + 0.005),
      };
    });

    expect(deltas.onBeat).toBeCloseTo(0, 3);
    expect(deltas.early20).toBeCloseTo(-20, 3);
    expect(deltas.late20).toBeCloseTo(20, 3);
    expect(deltas.justLate).toBeCloseTo(5, 3);
  });
});
