export interface DrummerProfile {
  id: string
  name: string
  blurb: string
  timingSigmaMs: number
  timingBiasMs: number
  dynamicControl: number
  ghostControl: number
  limbDependence: number
  fatiguePerBar: number
  fatigueTimingPerBar: number
  missProbability: number
  zoneConfusionProbability: number
  minimumVelocity?: number
}

export const drummers: DrummerProfile[] = [
  {
    id: 'fiona',
    name: 'First-Week Fiona',
    blurb: 'Beginner tolerance bands; does the app gate on skills it has not taught?',
    timingSigmaMs: 55,
    timingBiasMs: 5,
    dynamicControl: 0.2,
    ghostControl: 0.05,
    limbDependence: 0, // not specified for Fiona, default to 0
    fatiguePerBar: 0,
    fatigueTimingPerBar: 0,
    missProbability: 0.08,
    zoneConfusionProbability: 0
  },
  {
    id: 'ben',
    name: 'Bedroom Ben',
    blurb: 'Foot-follows-hands detection; the most common intermediate profile.',
    timingSigmaMs: 22,
    timingBiasMs: -8,
    dynamicControl: 0.6,
    ghostControl: 0.35,
    limbDependence: 0.8,
    fatiguePerBar: 0,
    fatigueTimingPerBar: 0,
    missProbability: 0,
    zoneConfusionProbability: 0
  },
  {
    id: 'greta',
    name: 'Gigging Greta',
    blurb: 'Clean pass. Any failure here is a false negative.',
    timingSigmaMs: 9,
    timingBiasMs: 0,
    dynamicControl: 0.95,
    ghostControl: 0.9,
    limbDependence: 0.15,
    fatiguePerBar: 0,
    fatigueTimingPerBar: 0,
    missProbability: 0,
    zoneConfusionProbability: 0
  },
  {
    id: 'rachel',
    name: 'Rushing Rachel',
    blurb: 'Must be diagnosed rushing.',
    timingSigmaMs: 14,
    timingBiasMs: -35,
    dynamicControl: 0.95,
    ghostControl: 0.9,
    limbDependence: 0,
    fatiguePerBar: 0,
    fatigueTimingPerBar: 0,
    missProbability: 0,
    zoneConfusionProbability: 0
  },
  {
    id: 'sam',
    name: 'Scattered Sam',
    blurb: 'Must be diagnosed inconsistent, never rushing. Pairs with #4.',
    timingSigmaMs: 45,
    timingBiasMs: 0,
    dynamicControl: 0.95,
    ghostControl: 0.9,
    limbDependence: 0,
    fatiguePerBar: 0,
    fatigueTimingPerBar: 0,
    missProbability: 0,
    zoneConfusionProbability: 0
  },
  {
    id: 'hank',
    name: 'Heavy-Hitter Hank',
    blurb: 'Ghost-too-loud detection; the Dynamics Gate\'s core purpose.',
    timingSigmaMs: 10, // assuming generic good timing so dynamics fail first
    timingBiasMs: 0,
    dynamicControl: 1.0,
    ghostControl: 1.0,
    limbDependence: 0,
    fatiguePerBar: 0,
    fatigueTimingPerBar: 0,
    missProbability: 0,
    zoneConfusionProbability: 0,
    minimumVelocity: 110
  },
  {
    id: 'frank',
    name: 'Fatiguing Frank',
    blurb: 'Fatigue drift; the non-dominant-hand decline the UX spec promises to surface.',
    timingSigmaMs: 12,
    timingBiasMs: 0,
    dynamicControl: 0.95,
    ghostControl: 0.9,
    limbDependence: 0,
    fatiguePerBar: 7,
    fatigueTimingPerBar: 6,
    missProbability: 0,
    zoneConfusionProbability: 0
  }
];
