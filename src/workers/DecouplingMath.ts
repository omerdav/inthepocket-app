export function calculateDecouplingScore(limbA: number[] | Float32Array, limbB: number[] | Float32Array): number | undefined {
  if (limbA.length === 0 || limbA.length !== limbB.length) return undefined;
  
  const n = limbA.length;
  // R3: require a minimum number of grid slots before scoring at all
  // With n=16, the 5% critical value for Pearson's r is ~0.50, which sits above most thresholds (0.4-0.6)
  // For n=8, the critical value is ~0.71, so |r| >= 0.4 is common under the null hypothesis.
  // 16 slots means at least 4 bars of quarter notes, or 2 bars with heavy subdivision.
  if (n < 16) return undefined;

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
  // R2: Choose variance floor and justify musically.
  // A standard deviation of ~5ms is world-class tightness; a variance of 25.0.
  // Below this, the drummer is playing virtually robotically, and any correlation
  // found in the noise is spurious rather than a real dependent drift.
  const VARIANCE_THRESHOLD = 25.0; 
  if (varA < VARIANCE_THRESHOLD || varB < VARIANCE_THRESHOLD) {
    return 0;
  }

  // 4. Calculate Pearson r
  const denominator = Math.sqrt(sumSqA * sumSqB);
  if (denominator === 0) return 0;
  
  return sumCoProduct / denominator;
}
