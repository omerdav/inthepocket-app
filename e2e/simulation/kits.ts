export type Zone =
  | 'kick' | 'snare-head' | 'snare-rim'
  | 'hihat-closed' | 'hihat-open' | 'hihat-chick'

export interface KitProfile {
  id: string
  name: string
  notes: Record<Zone, number | null>
  hiHat: {
    cc: number | null
    closedValue: number
    openValue: number
  }
  velocityCurve: (intended: number) => number
  triggerLatencyMs: number
  crosstalkProbability: number
  notesForReader: string
}

export const kits: KitProfile[] = [
  {
    id: 'alesis-nitro-pro',
    name: 'Alesis Nitro Pro',
    notes: {
      'kick': 36,
      'snare-head': 38,
      'snare-rim': 40,
      'hihat-closed': 42,
      'hihat-open': 46,
      'hihat-chick': 44,
    },
    hiHat: {
      cc: 4,
      closedValue: 127,
      openValue: 0,
    },
    velocityCurve: (v) => v,
    triggerLatencyMs: 0,
    crosstalkProbability: 0,
    notesForReader: 'Baseline — everything should pass.'
  },
  {
    id: 'roland-td-17',
    name: 'Roland TD-17',
    notes: {
      'kick': 36,
      'snare-head': 38,
      'snare-rim': 40,
      'hihat-closed': 22,
      'hihat-open': 46,
      'hihat-chick': 44,
    },
    hiHat: {
      cc: 4,
      closedValue: 127,
      openValue: 0,
    },
    velocityCurve: (v) => Math.round(127 * Math.pow(v / 127, 0.64)),
    triggerLatencyMs: 3,
    crosstalkProbability: 0.02,
    notesForReader: 'Unrecognised hi-hat note; ghost notes may be physically unattainable.'
  },
  {
    id: 'yamaha-dtx432',
    name: 'Yamaha DTX432',
    notes: {
      'kick': 36,
      'snare-head': 38,
      'snare-rim': 37,
      'hihat-closed': 42,
      'hihat-open': 46,
      'hihat-chick': 44,
    },
    hiHat: {
      cc: 4,
      closedValue: 0,
      openValue: 127,
    },
    velocityCurve: (v) => Math.round(Math.min(127, v * 1.15)),
    triggerLatencyMs: 6,
    crosstalkProbability: 0.05,
    notesForReader: 'Hi-hat state inversion; unrecognised rim note; latency pushing hits out.'
  },
  {
    id: 'budget',
    name: 'Budget single-zone',
    notes: {
      'kick': 36,
      'snare-head': 38,
      'snare-rim': null,
      'hihat-closed': 42,
      'hihat-open': null,
      'hihat-chick': null,
    },
    hiHat: {
      cc: null,
      closedValue: 0,
      openValue: 0,
    },
    velocityCurve: (v) => Math.round(55 + (v / 127) * 50),
    triggerLatencyMs: 8,
    crosstalkProbability: 0,
    notesForReader: 'No rim zone, no pedal CC. Narrow dynamic range.'
  }
];

export function kitSupportsZones(kit: KitProfile, zones: Zone[]): { ok: boolean; missing: Zone[] } {
  const missing = zones.filter(z => kit.notes[z] === null);
  return { ok: missing.length === 0, missing };
}
