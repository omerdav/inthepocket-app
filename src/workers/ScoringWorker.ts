import type { ScoringWorkerMessage, ScoringWorkerResultMessage } from './scoring.types';
import { SCORING_CATEGORIES, YELLOW_WINDOW_RATIO } from './scoring.types';
import { DiagnosticEngine } from './DiagnosticEngine';
import { calculateDecouplingScore } from './DecouplingMath';

// Pre-allocated buffers
let offsets: Float32Array;
let categories: Int8Array;
let dynamicScores: Int8Array;
let diagnosticRuleIds: Uint8Array;
let usedHits: Uint8Array;

self.onmessage = (event: MessageEvent<ScoringWorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    offsets = new Float32Array(msg.bufferSize);
    categories = new Int8Array(msg.bufferSize);
    dynamicScores = new Int8Array(msg.bufferSize);
    diagnosticRuleIds = new Uint8Array(msg.bufferSize);
    usedHits = new Uint8Array(msg.bufferSize);
  } else if (msg.type === 'calculate') {
    const { 
      targetBeats, targetVelocityMin, targetVelocityMax, targetZones, 
      hitTimestamps, hitVelocities, hitZones, 
      numTargets, numHits 
    } = msg;

    const greenWindow = msg.timingWindowMs ?? 30;
    const yellowWindow = greenWindow * YELLOW_WINDOW_RATIO;

    // Reset usedHits for this run
    for (let i = 0; i < numHits; i++) {
      usedHits[i] = 0;
    }

    // Determine max matching distance
    let maxDistance = 150; // default to 150ms if only 1 target
    if (numTargets > 1) {
      maxDistance = (targetBeats[1] - targetBeats[0]) / 2;
    }

    for (let j = 0; j < numTargets; j++) {
      const targetTime = targetBeats[j];
      const targetMinV = targetVelocityMin[j];
      const targetMaxV = targetVelocityMax[j];
      const targetZ = targetZones[j];

      let minDelta = Infinity;
      let closestHitIndex = -1;

      // Find the closest unused hit
      for (let i = 0; i < numHits; i++) {
        if (usedHits[i]) continue;

        const hitTime = hitTimestamps[i];
        const delta = hitTime - targetTime;
        
        if (Math.abs(delta) < Math.abs(minDelta)) {
          minDelta = delta;
          closestHitIndex = i;
        }
      }

      // If we found a hit within the maximum matching distance
      if (closestHitIndex !== -1 && Math.abs(minDelta) <= maxDistance) {
        usedHits[closestHitIndex] = 1; // Mark hit as consumed
        offsets[j] = minDelta;

        const hitV = hitVelocities[closestHitIndex];
        const hitZ = hitZones[closestHitIndex];

        // Timing categorization against this drill's tolerance band.
        const absDelta = Math.abs(minDelta);
        if (absDelta <= greenWindow) {
          categories[j] = SCORING_CATEGORIES.GREEN;
        } else if (absDelta <= yellowWindow) {
          categories[j] = SCORING_CATEGORIES.YELLOW;
        } else {
          categories[j] = SCORING_CATEGORIES.RED;
        }

        // Dynamic scoring
        const passDynamics = hitV >= targetMinV && hitV <= targetMaxV;
        dynamicScores[j] = passDynamics ? 1 : 0;

        // Diagnostics
        diagnosticRuleIds[j] = DiagnosticEngine.evaluate(minDelta, hitV, targetMinV, targetMaxV, hitZ, targetZ);

      } else {
        // No hit found for this target within range
        offsets[j] = 0;
        categories[j] = SCORING_CATEGORIES.MISS;
        dynamicScores[j] = 0; // FAIL
        diagnosticRuleIds[j] = 0; // Default or MISS-specific rule if we had one
      }
    }

    // --- Decoupling Math Aggregation ---
    // Identify shortest subdivision
    let minSubdivision = Infinity;
    let uniqueBeats: number[] = [];
    for (let i = 0; i < numTargets; i++) {
      if (uniqueBeats.length === 0 || targetBeats[i] - uniqueBeats[uniqueBeats.length - 1] > 5) {
        uniqueBeats.push(targetBeats[i]);
      }
    }
    for (let i = 1; i < uniqueBeats.length; i++) {
      const diff = uniqueBeats[i] - uniqueBeats[i - 1];
      if (diff < minSubdivision && diff > 5) minSubdivision = diff;
    }
    
    let decouplingScore = 0;
    if (minSubdivision !== Infinity && uniqueBeats.length > 2) {
      const gridLen = uniqueBeats.length;
      const handArray = new Float32Array(gridLen);
      const footArray = new Float32Array(gridLen);
      let lastHand = 0;
      let lastFoot = 0;

      for (let g = 0; g < gridLen; g++) {
        const beatTime = uniqueBeats[g];
        
        let handOffset = null;
        let footOffset = null;
        
        for (let i = 0; i < numTargets; i++) {
          if (Math.abs(targetBeats[i] - beatTime) < 5) { // Match to grid slot
            const z = targetZones[i];
            const isFoot = z === 36 || z === 42 || z === 44; // Kick, HH Closed, HH Chick
            const isHand = z === 38 || z === 40; // Snare Head, Snare Rim
            
            if (isHand) handOffset = offsets[i];
            if (isFoot) footOffset = offsets[i];
          }
        }
        
        // Carry forward previous offset if rest, or use current
        lastHand = handOffset !== null ? handOffset : lastHand;
        lastFoot = footOffset !== null ? footOffset : lastFoot;
        
        handArray[g] = lastHand;
        footArray[g] = lastFoot;
      }
      
      decouplingScore = calculateDecouplingScore(handArray, footArray);
    }

    const result: ScoringWorkerResultMessage = {
      type: 'result',
      offsets,
      categories,
      dynamicScores,
      diagnosticRuleIds,
      numResults: numTargets,
      decouplingScore
    };

    self.postMessage(result);
  }
};
