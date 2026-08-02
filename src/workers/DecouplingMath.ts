export function calculateDecouplingScore(limbA: number[] | Float32Array, limbB: number[] | Float32Array): number {
  if (limbA.length === 0 || limbA.length !== limbB.length) return 0;
  
  const n = limbA.length;
  if (n < 2) return 0; // Cannot correlate less than 2 points

  // 1. Calculate means
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += limbA[i];
    sumB += limbB[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  // 2. Detrend (subtract mean) and calculate variance/covariance components
  let sumSqA = 0;
  let sumSqB = 0;
  let sumCoProduct = 0;

  for (let i = 0; i < n; i++) {
    const diffA = limbA[i] - meanA;
    const diffB = limbB[i] - meanB;
    
    sumSqA += diffA * diffA;
    sumSqB += diffB * diffB;
    sumCoProduct += diffA * diffB;
  }

  const varA = sumSqA / n;
  const varB = sumSqB / n;

  // 3. Variance Guard
  // If the variance of either limb is extremely low (e.g., standard deviation < 1ms),
  // they are playing with robotic precision. Any correlation would be mathematically
  // spurious (dividing by near-zero). Return 0 (perfect independence / no dependent drift).
  const VARIANCE_THRESHOLD = 1.0; 
  if (varA < VARIANCE_THRESHOLD || varB < VARIANCE_THRESHOLD) {
    return 0;
  }

  // 4. Calculate Pearson r
  const denominator = Math.sqrt(sumSqA * sumSqB);
  if (denominator === 0) return 0;
  
  return sumCoProduct / denominator;
}
