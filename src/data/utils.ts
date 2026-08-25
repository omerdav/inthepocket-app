import { MIDI_NOTE } from '../audio/midiNotes';
import type { DrumType, DrillNote } from './types';

// Bi-directional mapping between DrumType and MIDI_NOTE
export const DRUM_TYPE_TO_MIDI: Record<DrumType, number> = {
  'snare-head': MIDI_NOTE.SNARE_HEAD,
  'snare-rim': MIDI_NOTE.SNARE_RIM,
  'kick': MIDI_NOTE.KICK,
  'hihat-open': MIDI_NOTE.HI_HAT_OPEN,
  'hihat-closed': MIDI_NOTE.HI_HAT_CLOSED,
  'hihat-chick': 44, // Using MIDI standard pedal hi-hat
};

export const MIDI_TO_DRUM_TYPE: Record<number, DrumType> = Object.entries(DRUM_TYPE_TO_MIDI).reduce((acc, [type, note]) => {
  acc[note as number] = type as DrumType;
  return acc;
}, {} as Record<number, DrumType>);

/**
 * Per-kit note mapping (Release_Plan 7.3, register P-3).
 *
 * `DRUM_TYPE_TO_MIDI` above is one hardcoded constant written against an
 * Alesis. On a Roland the closed hi-hat is note 22, on a Yamaha the cross-stick
 * is 37 — and before this, those pads did nothing at all: no error, no message,
 * nothing on screen. A drummer could not tell an unmapped pad from a dead
 * cable.
 *
 * `ProfilesStore.noteMap` is the seam. These two functions are the whole of the
 * mapping logic, kept pure so they can be tested without a browser or a kit.
 */

/**
 * Which drum a raw incoming note represents, for this kit.
 *
 * The profile's map wins; anything it does not name falls back to the default
 * (Alesis) layout, so a drummer who has mapped only their hi-hat keeps working
 * pads everywhere else.
 */
export function mapNoteToDrumType(
  note: number,
  noteMap?: Partial<Record<DrumType, number | null>> | null
): DrumType | null {
  if (noteMap) {
    for (const [drumType, mappedNote] of Object.entries(noteMap)) {
      if (mappedNote === note) return drumType as DrumType
    }
  }
  return MIDI_TO_DRUM_TYPE[note] ?? null
}

/**
 * Translate a raw incoming note into the canonical note the rest of the app
 * uses, or `null` if this kit has never been told what the pad is.
 *
 * THIS IS THE WHOLE DESIGN. Canonicalising at the MIDI boundary means nothing
 * downstream needs to know a note map exists: the crosstalk filter, the chick
 * de-duplication, the zone comparison in the scoring worker and every drill's
 * `targetZones` all keep comparing the same numbers they always did. The
 * alternative — threading the map down into `DrillRunner._score` — changes the
 * scoring path, which is guarded by a six-minute audit and is the last place
 * that should acquire a new parameter.
 *
 * A mapped note that resolves to a drum the default layout also uses is
 * idempotent: Alesis 42 maps to `hihat-closed` maps back to 42.
 */
export function canonicaliseNote(
  note: number,
  noteMap?: Partial<Record<DrumType, number | null>> | null
): number | null {
  const drumType = mapNoteToDrumType(note, noteMap)
  if (drumType === null) return null
  return DRUM_TYPE_TO_MIDI[drumType]
}

// Velocity Ranges (Calibrated for ~15-25dB drop on ghost notes)
export const VELOCITY_RANGES = {
  ACCENT: { min: 90, max: 127 },
  GHOST: { min: 15, max: 35 },
  NORMAL: { min: 40, max: 85 }
};

/** Notes per beat for each supported subdivision. */
export const SUBDIVISION = {
  quarter: 1,
  eighth: 2,
  triplet: 3,
  sixteenth: 4,
} as const;

export type Subdivision = keyof typeof SUBDIVISION;

export interface SequenceOptions {
  /** Rhythmic grid. Defaults to eighth notes. */
  subdivision?: Subdivision;
  /** Beats per bar. Defaults to 4. */
  beatsPerBar?: number;
  /** Drum zone for all generated notes. Defaults to 'snare-head'. */
  drumType?: DrumType;
  /**
   * Which positions are accented, as a mask cycled over the pattern.
   * `true` = accent, `false` = normal, `'ghost'` = ghost-note band.
   * Defaults to accenting the first note of each bar.
   */
  accentMask?: (boolean | 'ghost')[];
}

/**
 * Generate a `DrillNote[]` from a BPM, sticking pattern and bar count.
 *
 * Previously hardcoded to eighth notes with an accent on beat 1, which could
 * not express sixteenth-note doubles, triplet feels, or ghost-note placement —
 * i.e. most of the curriculum past the first drill.
 *
 * @param bpm Beats per minute
 * @param pattern Sticking per grid position; `''` is a rest
 * @param bars Number of bars
 */
export function generateSequence(
  bpm: number,
  pattern: ('R' | 'L' | '')[],
  bars: number,
  drumTypeOrOptions: DrumType | SequenceOptions = 'snare-head'
): DrillNote[] {
  const opts: SequenceOptions =
    typeof drumTypeOrOptions === 'string' ? { drumType: drumTypeOrOptions } : drumTypeOrOptions;

  const {
    subdivision = 'eighth',
    beatsPerBar = 4,
    drumType = 'snare-head',
    accentMask,
  } = opts;

  const notesPerBeat = SUBDIVISION[subdivision];
  const notesPerBar = beatsPerBar * notesPerBeat;
  const totalNotes = bars * notesPerBar;
  const msPerNote = 60000 / bpm / notesPerBeat;

  const sequence: DrillNote[] = [];

  for (let i = 0; i < totalNotes; i++) {
    const sticking = pattern[i % pattern.length];
    if (sticking === '') continue; // rest

    const accent = accentMask
      ? accentMask[i % accentMask.length]
      : i % notesPerBar === 0;

    const velocityRange =
      accent === 'ghost'
        ? VELOCITY_RANGES.GHOST
        : accent
          ? VELOCITY_RANGES.ACCENT
          : VELOCITY_RANGES.NORMAL;

    sequence.push({
      targetTimeMs: i * msPerNote,
      drumType,
      sticking,
      isAccent: accent === true,
      velocityRange,
    });
  }

  return sequence;
}

export function getMs(bpm: number, beats: number): number {
  return beats * (60000 / bpm);
}
