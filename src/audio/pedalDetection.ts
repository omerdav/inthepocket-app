/**
 * Works out which continuous controller this kit's hi-hat pedal sends
 * (register P-15).
 *
 * The pedal's CC number was hardcoded to 4. CC#4 (Foot Controller) is the
 * common convention and not a standard: modules differ and some are
 * user-configurable. On anything else the pedal did nothing at all — and
 * `hihat-chick` is nine of the notes across the ten drills, so most of the
 * Hi-Hat Independence bootcamp was silently unplayable.
 *
 * This is P-3 again in the dimension T-045 did not cover. That task made
 * *notes* per-kit and left *continuous controllers* assumed.
 *
 * Detection rides along with the calibration the drummer already does — they
 * are asked to work the pedal open and closed, so whichever controller moves
 * across that is the pedal. Nothing new to learn, and nothing to type.
 */

/** One controller-change observation. */
export interface CcObservation {
  cc: number
  value: number
}

/** The conventional default, used until a kit says otherwise. */
export const DEFAULT_PEDAL_CC = 4

/**
 * How far a controller must travel to count as the pedal, in raw CC units.
 *
 * A pedal worked deliberately from open to closed covers most of 0–127. Sixty
 * is comfortably less than that while being far more than the few units a
 * knob, a stray aftertouch stream or an expression pedal at rest will drift.
 * Below this the honest answer is "not sure", not a guess.
 */
export const MIN_PEDAL_TRAVEL = 60

export type PedalDetection =
  | { found: true; cc: number; travel: number }
  | { found: false; reason: string }

/**
 * Identify the pedal from a set of observations.
 *
 * Widest travel wins, because that is what a pedal being worked looks like and
 * nothing else on a drum module does it. Ties and near-ties are refused rather
 * than resolved arbitrarily: two controllers moving the full range at once
 * means something else is streaming, and picking one would leave the drummer
 * with a pedal that half works and no clue why.
 */
export function detectPedalCC(observations: CcObservation[]): PedalDetection {
  if (observations.length === 0) {
    return { found: false, reason: 'No controller movement was seen. Work the hi-hat pedal fully open and fully closed.' }
  }

  const range = new Map<number, { min: number; max: number }>()
  for (const { cc, value } of observations) {
    const seen = range.get(cc)
    if (!seen) range.set(cc, { min: value, max: value })
    else {
      if (value < seen.min) seen.min = value
      if (value > seen.max) seen.max = value
    }
  }

  const travels = [...range.entries()]
    .map(([cc, r]) => ({ cc, travel: r.max - r.min }))
    .sort((a, b) => b.travel - a.travel)

  const best = travels[0]
  if (best.travel < MIN_PEDAL_TRAVEL) {
    return {
      found: false,
      reason:
        `The furthest any controller moved was ${best.travel} of 127, which is ` +
        'too little to be a pedal being worked. Press it fully down and let it ' +
        'fully up.',
    }
  }

  const runnerUp = travels[1]
  if (runnerUp && best.travel - runnerUp.travel < MIN_PEDAL_TRAVEL / 2) {
    return {
      found: false,
      reason:
        `Two controllers moved about the same amount (CC ${best.cc} and ` +
        `CC ${runnerUp.cc}). Something else is sending continuous data, so the ` +
        'pedal cannot be identified with confidence.',
    }
  }

  return { found: true, cc: best.cc, travel: best.travel }
}
