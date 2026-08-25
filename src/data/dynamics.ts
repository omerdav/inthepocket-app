import { VELOCITY_RANGES } from './utils'
import type { DrillNote } from './types'
import type { DynamicsCalibration, VelocityRange } from './dynamicsCalibration'

/**
 * Turns a drill's declared velocities into what *this* drummer's kit produces
 * (Release_Plan 7.2).
 *
 * A drill note that says `{ min: 15, max: 35 }` is not really asking for MIDI
 * velocity 15–35. It is asking for a **ghost note**. The numbers are one
 * module's factory curve, written down as though they were universal. This
 * reads the intent back out and answers it with the drummer's own thresholds.
 *
 * UNCALIBRATED IS THE IDENTITY. With no calibration set, every branch returns
 * exactly the constant it returned before, so a drummer who has not calibrated
 * — and the virtual drummer that drives the thirty-row audit — see behaviour
 * that is byte-identical to today. That is deliberate: this changes the
 * scoring path, and the audit is the only guard on it.
 */

/** The active calibration, or null for the default curve. */
let active: DynamicsCalibration | null = null

/**
 * Apply a drummer's calibration. Pass null to fall back to the defaults.
 *
 * Module state rather than a parameter threaded through `DrillRunner.run()`:
 * the scoring path is guarded by a six-minute audit and is the last place that
 * should acquire an argument. Same reasoning as the kit note map.
 */
export function setDynamicsCalibration(calibration: DynamicsCalibration | null): void {
  active = calibration
}

export function getDynamicsCalibration(): DynamicsCalibration | null {
  return active
}

/** Which of the three the drill is asking for. */
export type NoteIntent = 'ghost' | 'accent' | 'normal' | 'any'

/**
 * Read a note's intent from what the drill declared.
 *
 * Drills express intent two ways — an explicit `velocityRange`, or `isAccent`
 * — and hi-hat chicks accept anything because a pedal's velocity says nothing
 * about how the foot was used.
 */
export function noteIntent(note: DrillNote): NoteIntent {
  if (note.drumType === 'hihat-chick') return 'any'

  if (note.velocityRange) {
    // Compare against the constants the drills were authored against. A range
    // topping out at or below the ghost ceiling is asking for a ghost; one
    // starting at or above the accent floor is asking for an accent.
    if (note.velocityRange.max <= VELOCITY_RANGES.GHOST.max) return 'ghost'
    if (note.velocityRange.min >= VELOCITY_RANGES.ACCENT.min) return 'accent'
    return 'normal'
  }

  return note.isAccent ? 'accent' : 'normal'
}

/**
 * The velocity window this note should be judged against, for this drummer.
 */
export function resolveVelocityRange(note: DrillNote): VelocityRange {
  const intent = noteIntent(note)

  if (intent === 'any') return { min: 0, max: 127 }

  if (!active) {
    // Identity. Exactly what the code did before calibration existed.
    if (note.velocityRange) return note.velocityRange
    return note.isAccent ? VELOCITY_RANGES.ACCENT : VELOCITY_RANGES.NORMAL
  }

  switch (intent) {
    case 'ghost':
      return { min: 0, max: active.ghostMax }
    case 'accent':
      return { min: active.accentMin, max: 127 }
    default:
      // Everything between the two thresholds. A "normal" stroke is defined by
      // what it is not, which is why it needs no third measurement.
      return { min: active.ghostMax + 1, max: active.accentMin - 1 }
  }
}
