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

/**
 * Mathematically generates a `DrillNote[]` array from a BPM + sticking pattern + bar count.
 * @param bpm Beats per minute
 * @param pattern Array of sticking ('R' or 'L') for eighth notes
 * @param bars Number of bars (assuming 4/4 time signature)
 * @param drumType The drum zone to assign all generated notes to (default: 'snare-head')
 * @returns Array of DrillNotes
 */
export function generateSequence(
  bpm: number,
  pattern: ('R' | 'L' | '')[],
  bars: number,
  drumType: DrumType = 'snare-head'
): DrillNote[] {
  const sequence: DrillNote[] = [];
  const beatsPerBar = 4;
  const notesPerBeat = 2; // Assuming 8th notes
  const totalNotes = bars * beatsPerBar * notesPerBeat;
  const msPerBeat = 60000 / bpm;
  const msPerNote = msPerBeat / notesPerBeat; // 8th note duration in ms
  
  for (let i = 0; i < totalNotes; i++) {
    const sticking = pattern[i % pattern.length];
    if (sticking !== '') { // allow empty strings for rests
      const isFirstBeat = (i % (beatsPerBar * notesPerBeat)) === 0;
      sequence.push({
        targetTimeMs: i * msPerNote,
        drumType,
        sticking,
        isAccent: isFirstBeat,
        velocityRange: isFirstBeat ? VELOCITY_RANGES.ACCENT : VELOCITY_RANGES.NORMAL
      });
    }
  }

  return sequence;
}
