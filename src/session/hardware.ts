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
  midiEngine?: Pick<MidiEngine, 'hasSeenNote'>
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
  }

  return { ok: missing.length === 0, missing, warnings };
}
