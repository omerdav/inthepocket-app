/**
 * The decision half of the audio preflight (T-032), kept separate from the
 * browser half so it can be tested without launching anything.
 *
 * WHY SEPARATE: the original probe made its judgement inline with
 * `if (m.wall > 3000 && ratio < 0.1)`. That reads fine and is one edit from
 * being a no-op — the `3000` is implicitly coupled to the last entry of the
 * sample schedule, and if the two ever drift apart no sample is ever judged
 * and a fully wedged clock passes silently. That was demonstrated: with the
 * last sample moved to 2900ms, a clock frozen at ratio 0.001 exits 0.
 *
 * A checker with a silent-pass mode is worse than no checker, so the coupling
 * is now explicit and asserted by `scripts/__tests__/audio-preflight.test.mjs`.
 */

/**
 * When to sample, in ms of wall clock.
 *
 * The early samples exist to be *shown*, not judged. A healthy AudioContext
 * needs a moment to spin its render thread up, and during that moment it is
 * indistinguishable from a wedged one — a real recovering machine measured
 * 0.045 at 256ms and 0.022 at 527ms before climbing to 0.830. Judging early
 * would fail healthy machines.
 */
export const SAMPLE_SCHEDULE_MS = [255, 522, 1039, 3095]

/** Only samples at or beyond this point are judged. */
export const DECISION_WINDOW_MS = 3000

/**
 * Below this ratio of audio-time to wall-time, the clock is not running.
 *
 * The observed wedge sits at 0.003 — the clock renders one 512-frame quantum
 * (10.7ms) and stops dead. A healthy machine measures 0.83–0.98. A *slow*
 * machine is not the concern: load makes the clock advance late, not stop, so
 * anything still rendering clears 0.1 by a wide margin at three seconds. The
 * gap between 0.003 and 0.83 is two and a half orders of magnitude; 0.1 sits
 * in the middle of it with room on both sides.
 */
export const WEDGED_RATIO = 0.1

/**
 * Judge a set of measurements.
 *
 * @param {Array<{wall: number, audio: number}>} measurements
 * @returns {{verdict: 'ok'|'wedged'|'inconclusive', judged: number, reason?: string}}
 */
export function evaluate(measurements) {
  const judged = measurements.filter((m) => m.wall >= DECISION_WINDOW_MS)

  // The guard that the original lacked. No samples in the window means the
  // schedule and the window have drifted apart, and nothing was actually
  // checked — which must never be reported as a pass.
  if (judged.length === 0) {
    return {
      verdict: 'inconclusive',
      judged: 0,
      reason:
        `No sample reached the ${DECISION_WINDOW_MS}ms decision window. ` +
        `The schedule ends at ${Math.max(...SAMPLE_SCHEDULE_MS)}ms — nothing was judged.`,
    }
  }

  const wedged = judged.filter((m) => m.audio / m.wall < WEDGED_RATIO)
  if (wedged.length > 0) {
    const worst = Math.min(...wedged.map((m) => m.audio / m.wall))
    return {
      verdict: 'wedged',
      judged: judged.length,
      reason: `Audio clock ratio ${worst.toFixed(3)} is below ${WEDGED_RATIO}. The clock is not advancing.`,
    }
  }

  return { verdict: 'ok', judged: judged.length }
}
