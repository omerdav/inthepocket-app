/**
 * The canonical note numbers the app speaks internally.
 *
 * A LEAF MODULE ON PURPOSE — it imports nothing. `MIDI_NOTE` used to live in
 * `midi.ts`, which was fine until `midi.ts` needed the note-mapping helpers
 * from `data/utils.ts`, which in turn needs these constants to build
 * `DRUM_TYPE_TO_MIDI` at module evaluation. That cycle left
 * `MIDI_NOTE.SNARE_HEAD` undefined at import time and took two test files down
 * with it.
 *
 * These are the *internal* vocabulary, not any particular kit's. A drummer's
 * pads are translated into these at the MIDI boundary — see
 * `canonicaliseNote` and `ProfilesStore.noteMap`.
 */
export const MIDI_NOTE = {
  SNARE_HEAD: 38,
  SNARE_RIM: 40,
  KICK: 36,
  HI_HAT_CLOSED: 42,
  HI_HAT_CHICK: 44,
  HI_HAT_OPEN: 46,
  CRASH: 49,
  RIDE: 51,
} as const
