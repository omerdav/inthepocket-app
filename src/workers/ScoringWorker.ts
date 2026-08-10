import type { ScoringWorkerMessage, ScoringWorkerResultMessage } from './scoring.types';
import { SCORING_CATEGORIES } from './scoring.types';
import { categoriseTiming, DEFAULT_TIMING_WINDOW_MS } from './timingBands';
import { DiagnosticEngine } from './DiagnosticEngine';
import { calculateDecouplingScore } from './DecouplingMath';

// Pre-allocated buffers
let offsets: Float32Array;
let categories: Int8Array;
let dynamicScores: Int8Array;
let diagnosticRuleIds: Uint8Array;
let usedHits: Uint8Array;
let struckZones: Int8Array;

self.onmessage = (event: MessageEvent<ScoringWorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    offsets = new Float32Array(msg.bufferSize);
    categories = new Int8Array(msg.bufferSize);
    dynamicScores = new Int8Array(msg.bufferSize);
    diagnosticRuleIds = new Uint8Array(msg.bufferSize);
    usedHits = new Uint8Array(msg.bufferSize);
    struckZones = new Int8Array(msg.bufferSize);
  } else if (msg.type === 'calculate') {
    const { 
      targetBeats, targetVelocityMin, targetVelocityMax, targetZones, 
      hitTimestamps, hitVelocities, hitZones, 
      numTargets, numHits 
    } = msg;

    const greenWindow = msg.timingWindowMs ?? DEFAULT_TIMING_WINDOW_MS;

    // Reset usedHits for this run
    for (let i = 0; i < numHits; i++) {
      usedHits[i] = 0;
    }

    // Determine max matching distance
    // R1: Derive from greenWindow.
    // R3: Ceiling should be wider than the timing window to allow badly-late hits to be RED.
    // YELLOW window is greenWindow * 1.67, RED is beyond that.
    // Let's cap matching to Math.max(150, greenWindow * 4) to give plenty of room for RED.
    let maxDistance = Math.max(150, greenWindow * 4);

    const cols = numHits + 1;
    const dp = new Float32Array((numTargets + 1) * cols);
    const choice = new Uint8Array((numTargets + 1) * cols);

    // Cost of leaving a target completely unmatched. 
    // In L1 distance terms, this is equivalent to 10,000ms of timing error.
    // It must be massively higher than any possible timing error (maxDistance is ~150-200ms) 
    // so the DP only drops a target if no hit is available, prioritizing ANY match over missing.
    const MISS_TARGET_PENALTY = 10000;

    // Cost of matching a hit that landed on the wrong instrument zone.
    // Set to 500ms equivalent—higher than maxDistance. This ensures the DP never steals 
    // a wrong-zone hit just to save a few milliseconds of timing error. It must be less 
    // than MISS_TARGET_PENALTY so that hitting the rim instead of the snare still registers 
    // as a hit (emitting ZONE_CONFUSION) rather than missing entirely.
    const ZONE_MISMATCH_PENALTY = 500;

    // Base cases
    dp[0] = 0;
    for (let i = 1; i <= numTargets; i++) {
      dp[i * cols + 0] = dp[(i - 1) * cols + 0] + MISS_TARGET_PENALTY;
      choice[i * cols + 0] = 2; // MISS target
    }
    for (let j = 1; j <= numHits; j++) {
      dp[0 * cols + j] = dp[0 * cols + (j - 1)]; // Skip hit
      choice[0 * cols + j] = 3; // SKIP hit
    }

    for (let i = 1; i <= numTargets; i++) {
      const targetTime = targetBeats[i - 1];
      const targetZ = targetZones[i - 1];

      for (let j = 1; j <= numHits; j++) {
        const hitTime = hitTimestamps[j - 1];
        const hitZ = hitZones[j - 1];

        const costMiss = dp[(i - 1) * cols + j] + MISS_TARGET_PENALTY;
        const costSkip = dp[i * cols + (j - 1)];

        let minCost = costMiss;
        let bestChoice = 2;

        if (costSkip < minCost) {
          minCost = costSkip;
          bestChoice = 3;
        }

        const delta = hitTime - targetTime;
        const absDelta = Math.abs(delta);
        
        if (absDelta <= maxDistance) {
          const zoneMatches = hitZ === targetZ;
          const matchCost = absDelta + (zoneMatches ? 0 : ZONE_MISMATCH_PENALTY);
          const costMatch = dp[(i - 1) * cols + (j - 1)] + matchCost;
          
          if (costMatch < minCost) {
            minCost = costMatch;
            bestChoice = 1;
          }

          // Damerau-Levenshtein transposition for simultaneous targets
          if (i > 1 && j > 1 && targetBeats[i - 1] === targetBeats[i - 2]) {
            const prevTargetTime = targetBeats[i - 2];
            const prevTargetZ = targetZones[i - 2];
            const prevHitTime = hitTimestamps[j - 2];
            const prevHitZ = hitZones[j - 2];

            const delta1 = prevHitTime - targetTime;
            const delta2 = hitTime - prevTargetTime;
            
            if (Math.abs(delta1) <= maxDistance && Math.abs(delta2) <= maxDistance) {
              const zm1 = prevHitZ === targetZ;
              const zm2 = hitZ === prevTargetZ;
              const transCost = Math.abs(delta1) + (zm1 ? 0 : ZONE_MISMATCH_PENALTY) + Math.abs(delta2) + (zm2 ? 0 : ZONE_MISMATCH_PENALTY);
              
              const costTrans = dp[(i - 2) * cols + (j - 2)] + transCost;
              if (costTrans < minCost) {
                minCost = costTrans;
                bestChoice = 4;
              }
            }
          }
        }

        dp[i * cols + j] = minCost;
        choice[i * cols + j] = bestChoice;
      }
    }

    const matchedHits = new Int32Array(numTargets).fill(-1);
    let currI = numTargets;
    let currJ = numHits;
    
    while (currI > 0 || currJ > 0) {
      if (currI > 0 && currJ > 0) {
        const c = choice[currI * cols + currJ];
        if (c === 1) { // Match
          matchedHits[currI - 1] = currJ - 1;
          currI--;
          currJ--;
        } else if (c === 4) { // Transposition
          matchedHits[currI - 1] = currJ - 2;
          matchedHits[currI - 2] = currJ - 1;
          currI -= 2;
          currJ -= 2;
        } else if (c === 2) { // Miss target
          currI--;
        } else { // Skip hit
          currJ--;
        }
      } else if (currI > 0) {
        currI--;
      } else {
        currJ--;
      }
    }

    for (let j = 0; j < numTargets; j++) {
      const targetTime = targetBeats[j];
      const targetMinV = targetVelocityMin[j];
      const targetMaxV = targetVelocityMax[j];
      const targetZ = targetZones[j];

      const closestHitIndex = matchedHits[j];

      // If we found a hit within the maximum matching distance
      if (closestHitIndex !== -1) {
        usedHits[closestHitIndex] = 1; // Mark hit as consumed
        const hitTime = hitTimestamps[closestHitIndex];
        const minDelta = hitTime - targetTime;
        offsets[j] = minDelta;

        const hitV = hitVelocities[closestHitIndex];
        const hitZ = hitZones[closestHitIndex];

        // Timing categorization against this drill's tolerance band. Shared
        // with the live Groove Circle so the visual and the grade cannot
        // disagree about what counts as green.
        categories[j] = categoriseTiming(minDelta, greenWindow);

        // Dynamic scoring
        const passDynamics = hitV >= targetMinV && hitV <= targetMaxV;
        dynamicScores[j] = passDynamics ? 1 : 0;

        // Diagnostics
        diagnosticRuleIds[j] = DiagnosticEngine.evaluate(minDelta, hitV, targetMinV, targetMaxV, hitZ, targetZ);
        
        struckZones[j] = hitZ;

      } else {
        // No hit found for this target within range
        offsets[j] = 0;
        categories[j] = SCORING_CATEGORIES.MISS;
        dynamicScores[j] = 0; // FAIL
        diagnosticRuleIds[j] = 0; // Default or MISS-specific rule if we had one
        struckZones[j] = -1;
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
      struckZones,
      numResults: numTargets,
      decouplingScore
    };

    self.postMessage(result);
  }
};
