import { describe, it, expect, afterEach } from 'vitest'
import {
  calibrate,
  MIN_SAMPLES_PER_INTENT,
  type StrokeIntent,
} from '../dynamicsCalibration'
import {
  resolveVelocityRange,
  setDynamicsCalibration,
  noteIntent,
} from '../dynamics'
import { VELOCITY_RANGES } from '../utils'
import type { DrillNote } from '../types'

/**
 * Per-drummer dynamics (Release_Plan 7.2).
 *
 * The defect: `dynamics-gate-drill-3` and `-5` demand MIDI velocity 15–35 for
 * a ghost note and 90–127 for an accent, absolutely, on any kit. Those numbers
 * came from one module with its factory curve.
 */

/** n samples clustered around a centre, spread evenly — a plausible stroke set. */
function cluster(centre: number, n = MIN_SAMPLES_PER_INTENT, spread = 4): number[] {
  return Array.from({ length: n }, (_, i) => centre + ((i % (spread * 2 + 1)) - spread))
}

const note = (over: Partial<DrillNote> = {}): DrillNote =>
  ({ targetTimeMs: 0, drumType: 'snare-head', sticking: 'R', isAccent: false, ...over }) as DrillNote

afterEach(() => setDynamicsCalibration(null))

describe('calibrate', () => {
  it('derives thresholds that sit between the clusters, not on their edges', () => {
    const result = calibrate({ soft: cluster(40), normal: cluster(70), hard: cluster(105) })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { ghostMax, accentMin } = result.calibration
    // A drummer aiming at the top of their ghost range must still read as a
    // ghost, and one drifting under their accent must still read as an accent.
    expect(ghostMax).toBeGreaterThan(40)
    expect(ghostMax).toBeLessThan(70)
    expect(accentMin).toBeGreaterThan(70)
    expect(accentMin).toBeLessThan(105)
  })

  it('refuses when soft and normal are the same stroke played twice', () => {
    // Inventing a boundary here would fail the drummer at random — the
    // mistake T-031 made with the decoupling score.
    const result = calibrate({ soft: cluster(60), normal: cluster(64), hard: cluster(105) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('soft and normal')
  })

  it('refuses when the kit compresses at the top', () => {
    const result = calibrate({ soft: cluster(30), normal: cluster(95), hard: cluster(100) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('normal and hard')
  })

  it('refuses rather than answering from too few strikes', () => {
    const short: Record<StrokeIntent, number[]> = {
      soft: cluster(40, 3),
      normal: cluster(70),
      hard: cluster(105),
    }
    const result = calibrate(short)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain(String(MIN_SAMPLES_PER_INTENT))
  })
})

describe('resolveVelocityRange', () => {
  it('is the identity when nobody has calibrated', () => {
    // THE AUDIT-SAFETY TEST. The thirty-row drill audit runs a virtual drummer
    // with no calibration; if this ever stops returning the original
    // constants, every dynamics row moves and the guard fires on a change
    // that was supposed to be invisible.
    setDynamicsCalibration(null)

    expect(resolveVelocityRange(note({ isAccent: true }))).toEqual(VELOCITY_RANGES.ACCENT)
    expect(resolveVelocityRange(note({ isAccent: false }))).toEqual(VELOCITY_RANGES.NORMAL)

    const declared = { min: 15, max: 35 }
    expect(resolveVelocityRange(note({ velocityRange: declared }))).toEqual(declared)

    expect(resolveVelocityRange(note({ drumType: 'hihat-chick' }))).toEqual({ min: 0, max: 127 })
  })

  it('reads a drill note for its intent, not its literal numbers', () => {
    expect(noteIntent(note({ velocityRange: { min: 15, max: 35 } }))).toBe('ghost')
    expect(noteIntent(note({ velocityRange: { min: 90, max: 127 } }))).toBe('accent')
    expect(noteIntent(note({ isAccent: true }))).toBe('accent')
    expect(noteIntent(note({ drumType: 'hihat-chick' }))).toBe('any')
  })

  it('passes a drummer whose ghost note lands at 45 — the whole point', () => {
    // This kit's curve puts a genuine ghost note near 45 and a genuine accent
    // near 100. Uncalibrated, the drill demands 15–35 and this drummer fails
    // every ghost note in drills 3 and 5 while playing correctly.
    const ghostNote = note({ velocityRange: { min: 15, max: 35 } })
    const theirGhost = 45

    setDynamicsCalibration(null)
    const before = resolveVelocityRange(ghostNote)
    expect(theirGhost > before.max, 'uncalibrated, a correct ghost note fails').toBe(true)

    const result = calibrate({ soft: cluster(45), normal: cluster(75), hard: cluster(105) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    setDynamicsCalibration(result.calibration)

    const after = resolveVelocityRange(ghostNote)
    expect(theirGhost <= after.max, 'calibrated, the same stroke passes').toBe(true)
  })

  it('keeps the three bands adjacent and non-overlapping', () => {
    const result = calibrate({ soft: cluster(40), normal: cluster(70), hard: cluster(105) })
    if (!result.ok) throw new Error('fixture should calibrate')
    setDynamicsCalibration(result.calibration)

    const ghost = resolveVelocityRange(note({ velocityRange: { min: 15, max: 35 } }))
    const normal = resolveVelocityRange(note({ isAccent: false }))
    const accent = resolveVelocityRange(note({ isAccent: true }))

    // No velocity may fall in a gap between bands, or a drummer would fail a
    // stroke that is not wrong, only unclassified.
    expect(normal.min).toBe(ghost.max + 1)
    expect(accent.min).toBe(normal.max + 1)
  })
})
