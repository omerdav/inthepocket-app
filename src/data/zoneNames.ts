import type { DrumType } from './types';
import { DRUM_TYPE_TO_MIDI } from './utils';

export const DRUM_TYPE_TO_DISPLAY_NAME: Record<DrumType, string> = {
  'snare-head': 'the head',
  'snare-rim': 'the rim',
  'kick': 'the kick',
  'hihat-open': 'the open hi-hat',
  'hihat-closed': 'the closed hi-hat',
  'hihat-chick': 'the hi-hat pedal',
};

// Also export a MIDI note to display name map for use when we only have the raw MIDI note
export const MIDI_NOTE_TO_DISPLAY_NAME: Record<number, string> = {};

for (const [drumType, midiNote] of Object.entries(DRUM_TYPE_TO_MIDI)) {
  MIDI_NOTE_TO_DISPLAY_NAME[midiNote] = DRUM_TYPE_TO_DISPLAY_NAME[drumType as DrumType];
}
