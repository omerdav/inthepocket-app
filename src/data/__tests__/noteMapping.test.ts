import { describe, it, expect } from 'vitest'
import { mapNoteToDrumType, canonicaliseNote, DRUM_TYPE_TO_MIDI } from '../utils'
import type { DrumType } from '../types'

/**
 * Per-kit note mapping (register P-3, Release_Plan 7.3).
 *
 * The notes below are real. A Roland closed hi-hat sends 22, a Yamaha
 * cross-stick sends 37, and the app's default layout is an Alesis. Before this,
 * a drummer on either of the first two hit a pad and nothing happened at all.
 */

/** The default (Alesis) layout, for readability in the assertions. */
const ALESIS_CLOSED_HH = DRUM_TYPE_TO_MIDI['hihat-closed']
const ALESIS_SNARE_RIM = DRUM_TYPE_TO_MIDI['snare-rim']

const ROLAND: Partial<Record<DrumType, number | null>> = { 'hihat-closed': 22 }
const YAMAHA: Partial<Record<DrumType, number | null>> = { 'snare-rim': 37 }

describe('per-kit note mapping', () => {
  it('resolves a Roland closed hi-hat, which the default layout does not know', () => {
    expect(mapNoteToDrumType(22, ROLAND)).toBe('hihat-closed')
    expect(canonicaliseNote(22, ROLAND)).toBe(ALESIS_CLOSED_HH)
  })

  it('resolves a Yamaha cross-stick', () => {
    expect(mapNoteToDrumType(37, YAMAHA)).toBe('snare-rim')
    expect(canonicaliseNote(37, YAMAHA)).toBe(ALESIS_SNARE_RIM)
  })

  it('leaves the default kit untouched', () => {
    // An Alesis drummer must see no change whatsoever. If this moves, the
    // whole existing drill audit moves with it.
    for (const [drumType, note] of Object.entries(DRUM_TYPE_TO_MIDI)) {
      expect(mapNoteToDrumType(note, null)).toBe(drumType)
      expect(canonicaliseNote(note, null)).toBe(note)
    }
  })

  it('is idempotent on a note the map and the default agree about', () => {
    expect(canonicaliseNote(ALESIS_CLOSED_HH, { 'hihat-closed': ALESIS_CLOSED_HH })).toBe(
      ALESIS_CLOSED_HH
    )
  })

  it('falls back to the default for pads the profile does not name', () => {
    // A drummer who has mapped only their hi-hat must keep working pads
    // everywhere else — otherwise mapping one pad breaks the other five.
    expect(mapNoteToDrumType(DRUM_TYPE_TO_MIDI['kick'], ROLAND)).toBe('kick')
    expect(canonicaliseNote(DRUM_TYPE_TO_MIDI['kick'], ROLAND)).toBe(DRUM_TYPE_TO_MIDI['kick'])
  })

  it('returns null for a pad nothing knows about', () => {
    // Null is the signal that lets the app say "I do not know this pad"
    // instead of staying silent, which is what made a Roland hi-hat
    // indistinguishable from a dead cable.
    expect(mapNoteToDrumType(99, null)).toBeNull()
    expect(canonicaliseNote(99, null)).toBeNull()
    expect(canonicaliseNote(99, ROLAND)).toBeNull()
  })

  it('lets the profile override a note the default layout already uses', () => {
    // A kit whose ride bell happens to send the default snare note must be
    // able to say so, and the profile has to win.
    const override: Partial<Record<DrumType, number | null>> = {
      'kick': ALESIS_CLOSED_HH,
    }
    expect(mapNoteToDrumType(ALESIS_CLOSED_HH, override)).toBe('kick')
    expect(canonicaliseNote(ALESIS_CLOSED_HH, override)).toBe(DRUM_TYPE_TO_MIDI['kick'])
  })
})
