import { MIDI_NOTE, type MidiNoteNumber } from '../audio/midi';
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
