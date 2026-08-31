import { describe, it, expect } from 'vitest'
import {
  detectPedalCC,
  DEFAULT_PEDAL_CC,
  MIN_PEDAL_TRAVEL,
  type CcObservation,
} from '../pedalDetection'

/**
 * Identifying the hi-hat pedal's controller (register P-15).
 *
 * The number was hardcoded to 4 — a convention, not a standard. On a module
 * that sends anything else the pedal did nothing, and nine of the notes across
 * the ten drills are hi-hat chicks.
 */

/** A pedal worked from fully open to fully closed on a given controller. */
function sweep(cc: number, from = 0, to = 127, steps = 12): CcObservation[] {
  return Array.from({ length: steps }, (_, i) => ({
    cc,
    value: Math.round(from + ((to - from) * i) / (steps - 1)),
  }))
}

describe('detectPedalCC', () => {
  it('finds the conventional CC#4 pedal', () => {
    const r = detectPedalCC(sweep(DEFAULT_PEDAL_CC))
    expect(r.found).toBe(true)
    if (r.found) expect(r.cc).toBe(DEFAULT_PEDAL_CC)
  })

  it('finds a pedal on a controller nobody anticipated', () => {
    // The whole point. A module sending CC#1, CC#11 or anything else used to
    // leave the pedal inert with no error and nothing on screen.
    for (const cc of [1, 11, 64, 127]) {
      const r = detectPedalCC(sweep(cc))
      expect(r.found, `CC ${cc} should be detectable`).toBe(true)
      if (r.found) expect(r.cc).toBe(cc)
    }
  })

  it('ignores a controller that barely drifts', () => {
    // A knob nudged, or an expression pedal resting, must not outrank a real
    // pedal sweep.
    const noise = Array.from({ length: 20 }, (_, i) => ({ cc: 7, value: 60 + (i % 3) }))
    const r = detectPedalCC([...noise, ...sweep(11)])
    expect(r.found).toBe(true)
    if (r.found) expect(r.cc).toBe(11)
  })

  it('refuses when nothing moved far enough to be a pedal', () => {
    // "Not sure" beats a guess: a wrong controller leaves the drummer with a
    // pedal that half works and no clue why.
    const r = detectPedalCC(sweep(4, 40, 40 + MIN_PEDAL_TRAVEL - 10))
    expect(r.found).toBe(false)
    if (!r.found) expect(r.reason).toContain('too little')
  })

  it('refuses when two controllers moved about the same amount', () => {
    // Some modules stream a second continuous value. Picking one arbitrarily
    // would be a coin flip presented as a result.
    const r = detectPedalCC([...sweep(4), ...sweep(11)])
    expect(r.found).toBe(false)
    if (!r.found) expect(r.reason).toContain('Two controllers')
  })

  it('refuses when the pedal was never touched', () => {
    const r = detectPedalCC([])
    expect(r.found).toBe(false)
    if (!r.found) expect(r.reason).toContain('No controller movement')
  })

  it('handles an inverted pedal, where closed reads lower than open', () => {
    // ProfilesStore already documents that max may be below min on inverted
    // kits. Detection is about travel, so direction must not matter.
    const r = detectPedalCC(sweep(4, 127, 0))
    expect(r.found).toBe(true)
    if (r.found) expect(r.cc).toBe(DEFAULT_PEDAL_CC)
  })
})
