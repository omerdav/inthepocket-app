import type { DrumType, ContentUnit } from '../data/types';
import { DRUM_TYPE_TO_MIDI } from '../data/utils';
import type { MidiEngine } from '../audio/midi';

export interface HardwareCapabilityResult {
  ok: boolean;
  missing: DrumType[];
  warnings: DrumType[];
}

export function checkHardwareCapability(
  unit: ContentUnit,
  noteMap: Partial<Record<DrumType, number | null>> | null,
  midiEngine?: Pick<MidiEngine, 'hasSeenNote' | 'hasSeenPedal'>
): HardwareCapabilityResult {
  const requiredZones = Array.from(new Set(unit.sequence.map(n => n.drumType)));
  const missing: DrumType[] = [];
  const warnings: DrumType[] = [];

  for (const zone of requiredZones) {
    // 1. Check if explicitly absent in the note map
    if (noteMap && noteMap[zone] === null) {
      missing.push(zone);
      continue;
    }

    // 2. Minimum viable check: If we have no per-kit configuration for this zone,
    // we assume it is supported via the default MIDI_NOTE mapping. However, if it's
    // a secondary zone like snare-rim and we haven't seen it hit yet, we produce a warning.
    const mappedNote = noteMap?.[zone] ?? DRUM_TYPE_TO_MIDI[zone];

    if (mappedNote != null && zone === 'snare-rim' && midiEngine) {
      if (!midiEngine.hasSeenNote(mappedNote)) {
        warnings.push(zone);
      }
    }

    /**
     * The hi-hat pedal, which is the zone most likely to be silently absent.
     *
     * Nine of the ten drills' `hihat-chick` notes are in the Hi-Hat
     * Independence bootcamp, and a chick normally arrives as a *controller*
     * (this kit's pedal CC), not a note — so `hasSeenNote` cannot see it. A
     * module whose pedal sends a controller we have not identified, or no
     * continuous data at all, produces a drill where every chick is simply
     * missing, and the drummer is told "You missed 9 of 16 notes." They then
     * debug their playing, or their pedal, for a fault the app already knew
     * about before they pressed Start.
     *
     * Both routes count: modules that send a physical note 44 on the chick are
     * equally playable, so seeing that note vouches for the pedal just as
     * controller traffic does. Warning when either has been seen would be a
     * false alarm.
     */
    if (zone === 'hihat-chick' && midiEngine) {
      const pedalSeen = midiEngine.hasSeenPedal;
      const chickNoteSeen = mappedNote != null && midiEngine.hasSeenNote(mappedNote);
      if (!pedalSeen && !chickNoteSeen) {
        warnings.push(zone);
      }
    }
  }

  return { ok: missing.length === 0, missing, warnings };
}
