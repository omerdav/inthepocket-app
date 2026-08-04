import { gaussian } from './rng';
import type { DrummerProfile } from './drummers';
import type { KitProfile, Zone } from './kits';
import type { DrillNote } from '../../src/data/types';

export interface SimulatedHit {
  noteNumber: number;
  velocity: number;
  offsetMsFromDrillStart: number;
  intendedZone: Zone;
  intendedVelocity: number;
}

export function generatePerformance(
  sequence: DrillNote[],
  drummer: DrummerProfile,
  kit: KitProfile,
  rng: () => number,
  bpm: number
): SimulatedHit[] {
  const hits: SimulatedHit[] = [];
  
  const msPerBeat = 60000 / bpm;
  const msPerBar = msPerBeat * 4;
  
  for (const note of sequence) {
    // 1. Roll for a miss
    if (rng() < drummer.missProbability) {
      continue;
    }
    
    const bar = Math.floor(note.targetTimeMs / msPerBar);
    
    // 2. Timing
    const currentSigma = drummer.timingSigmaMs + (drummer.fatigueTimingPerBar * bar);
    const offsetMs = drummer.timingBiasMs + gaussian(rng, 0, currentSigma);
    let hitTime = note.targetTimeMs + offsetMs;
    
    // 3. Intended Velocity
    let targetVel = 65; // normal
    let controlError = 1 - drummer.dynamicControl;
    
    // Check if it's a ghost based on velocityRange
    const isGhost = (note as any).velocityRange && (note as any).velocityRange.max <= 35;
    
    if (note.isAccent) {
      targetVel = 110;
      controlError = 1 - drummer.dynamicControl;
    } else if (isGhost) {
      targetVel = 25;
      controlError = 1 - drummer.ghostControl;
    }
    
    // Apply control error (spread velocity around target based on error)
    // If control is 1 (error 0), velocity is exactly target.
    // If control is 0 (error 1), velocity can swing wildly.
    let intendedVelocity = targetVel + gaussian(rng, 0, controlError * 30);
    
    if (drummer.minimumVelocity !== undefined) {
      intendedVelocity = Math.max(drummer.minimumVelocity, intendedVelocity);
    }
    
    // 4. Apply fatigue decline
    intendedVelocity -= (drummer.fatiguePerBar * bar);
    intendedVelocity = Math.max(1, Math.min(127, Math.round(intendedVelocity)));
    
    // 5. Zone confusion
    let intendedZone = note.drumType as Zone;
    if (rng() < drummer.zoneConfusionProbability) {
      if (intendedZone === 'snare-rim') intendedZone = 'snare-head';
    }
    
    // 6. Map zone -> kit note number
    const noteNumber = kit.notes[intendedZone];
    if (noteNumber === null) {
      // unplayable on this kit, don't emit
      continue;
    }
    
    // 7. Apply kit velocity curve and latency
    const reportedVelocity = kit.velocityCurve(intendedVelocity);
    hitTime += kit.triggerLatencyMs;
    
    hits.push({
      noteNumber,
      velocity: reportedVelocity,
      offsetMsFromDrillStart: hitTime,
      intendedZone,
      intendedVelocity
    });
    
    // 8. Crosstalk
    if (rng() < kit.crosstalkProbability) {
      if (intendedZone === 'snare-head' && kit.notes['snare-rim'] !== null) {
        hits.push({
          noteNumber: kit.notes['snare-rim']!,
          velocity: Math.max(1, Math.round(reportedVelocity * 0.3)),
          offsetMsFromDrillStart: hitTime + (rng() * 10), // within 10ms
          intendedZone: 'snare-rim',
          intendedVelocity: Math.round(intendedVelocity * 0.3)
        });
      }
    }
  }
  
  // Sort by offset to be safe
  hits.sort((a, b) => a.offsetMsFromDrillStart - b.offsetMsFromDrillStart);
  
  return hits;
}
