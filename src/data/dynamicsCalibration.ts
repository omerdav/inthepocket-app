/**
 * Per-drummer, per-kit velocity calibration (Release_Plan 7.2).
 *
 * THE DEFECT THIS FIXES. `dynamics-gate-drill-3` and `-5` require a ghost note
 * to land in MIDI velocity 15–35 and an accent to reach 90–127. Those numbers
 * are absolute and were written against one module with its factory curve. A
 * drummer whose kit maps a genuine ghost note to velocity 45 is told their
 * dynamics are wrong when their playing is fine — the same family as C-2 and
 * C-36, where the app blamed the drummer for its own assumption.
 *
 * ON `dynamicContrastDb`. Every drill declares one (10 or 15) and **nothing
 * reads it** — it is dead data, and it always was. It cannot be honoured as
 * written either: decibels are a property of the sound the module produces,
 * and all the app receives is a 7-bit velocity whose relationship to loudness
 * is set by a user-configurable curve it cannot see. Measuring dB would take a
 * microphone. So this keeps the *intent* — accent and ghost must be
 * distinguishable — and expresses it in the only unit actually available:
 * separation in velocity, measured on this drummer's own kit.
 *
 * WHAT IT REFUSES TO DO. If a drummer's soft and normal strokes overlap, there
 * is no honest boundary between them, and inventing one would fail them at
 * random. T-031 taught this the expensive way: the decoupling score correlated
 * noise for weeks because it answered when it should have abstained. This
 * returns a reason instead.
 */

/** What the drummer was asked to play. */
export type StrokeIntent = 'soft' | 'normal' | 'hard'

export const STROKE_INTENTS: StrokeIntent[] = ['soft', 'normal', 'hard']

export interface VelocityRange {
  min: number
  max: number
}

export interface DynamicsCalibration {
  /** Highest velocity still counted as a ghost note. */
  ghostMax: number
  /** Lowest velocity that counts as an accent. */
  accentMin: number
  /** Median of each intent, kept so a later session can show drift. */
  medians: Record<StrokeIntent, number>
  capturedAt: number
}

export type CalibrationOutcome =
  | { ok: true; calibration: DynamicsCalibration }
  | { ok: false; reason: string }

/**
 * Samples needed per intent before the result means anything.
 *
 * Eight strikes is a bar of eighths — short enough that a drummer will do it
 * three times without resenting it, long enough that one mis-hit cannot move
 * the median. Below this the answer is "not yet", not a smaller number.
 */
export const MIN_SAMPLES_PER_INTENT = 8

/**
 * Minimum gap between neighbouring medians, in MIDI velocity.
 *
 * Ten of 127 is roughly 8% of the range. Below that the two intents are the
 * same stroke played twice, and a boundary drawn between them would be noise
 * dressed as a threshold.
 */
export const MIN_MEDIAN_GAP = 10

/** Percentile of a sorted copy, linear, no interpolation games. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[index]
}

/**
 * Turn three sets of strikes into this drummer's thresholds, or explain why not.
 *
 * The boundaries sit between the clusters rather than on a cluster's edge: a
 * drummer aiming at the top of their ghost range should still register as a
 * ghost, and one drifting under their accent should still register as an
 * accent. Putting the line at the midpoint of the gap gives both sides room.
 */
export function calibrate(
  samples: Record<StrokeIntent, number[]>,
  now: number = Date.now()
): CalibrationOutcome {
  for (const intent of STROKE_INTENTS) {
    const count = samples[intent]?.length ?? 0
    if (count < MIN_SAMPLES_PER_INTENT) {
      return {
        ok: false,
        reason: `Only ${count} ${intent} strokes recorded; ${MIN_SAMPLES_PER_INTENT} are needed.`,
      }
    }
  }

  const medians = {
    soft: quantile(samples.soft, 0.5),
    normal: quantile(samples.normal, 0.5),
    hard: quantile(samples.hard, 0.5),
  }

  if (medians.normal - medians.soft < MIN_MEDIAN_GAP) {
    return {
      ok: false,
      reason:
        'Your soft and normal strokes came out at nearly the same velocity ' +
        `(${medians.soft} and ${medians.normal}). Try playing the soft one lighter, ` +
        'or raise the kit’s sensitivity — until they separate, no ghost-note ' +
        'threshold would mean anything.',
    }
  }

  if (medians.hard - medians.normal < MIN_MEDIAN_GAP) {
    return {
      ok: false,
      reason:
        'Your normal and hard strokes came out at nearly the same velocity ' +
        `(${medians.normal} and ${medians.hard}). Either the accent needs more ` +
        'weight, or the kit’s curve is compressing at the top.',
    }
  }

  // Boundaries from the gaps between clusters, not from the medians alone, so
  // a wide spread narrows the band it is entitled to.
  const softTop = quantile(samples.soft, 0.75)
  const normalBottom = quantile(samples.normal, 0.25)
  const normalTop = quantile(samples.normal, 0.75)
  const hardBottom = quantile(samples.hard, 0.25)

  const ghostMax = Math.round((softTop + normalBottom) / 2)
  const accentMin = Math.round((normalTop + hardBottom) / 2)

  if (accentMin <= ghostMax) {
    return {
      ok: false,
      reason:
        'Your three stroke levels overlap too much to draw two separate ' +
        'thresholds. Play the three levels further apart and try again.',
    }
  }

  return { ok: true, calibration: { ghostMax, accentMin, medians, capturedAt: now } }
}
