# T-005 Findings Report

## Suspicions from the Spec

1. **Ghost notes may be unreachable.**
   - **REFUTED**: Hitting a snare head with a velocity within the ghost note band (15-35) registers correctly. Drill 3 expects ghost notes and successfully passed with perfect accuracy.

2. **Rim zone on cross-stick drills.**
   - **REFUTED**: Drills 4 and 5 both use `snare-rim` (MIDI note 40). Passing note 40 registers correctly as the rim, passing the strict Drill 5 graduation criteria without zone confusion. 

3. **`hihat-chick` maps to MIDI note 44 vs CC#4.**
   - **CONFIRMED**: The `HiHatStateTracker` legitimately emits a `hihat-chick` event (note 44) when CC#4 is pressed quickly, but it *first* emits a `hihat-closed` event (note 42) at the exact same timestamp. The `ScoringWorker` consumes the `hihat-closed` hit first and mismatches it against the `hihat-chick` target. This results in a ZONE_CONFUSION error on every hi-hat chick. 
   - Additionally, the text for `ZONE_CONFUSION` in `diagnosis.ts` is completely hardcoded to *"you hit the head instead of the rim — soft isn't the same as cross-stick"*. This creates an incredibly misleading error message for the drummer. As a result of this bug, no hi-hat drill is currently passable.

4. **Decoupling score.**
   - **CONFIRMED**: The decoupling score is completely ignored. `DrillRunner._score()` explicitly hardcodes `evaluateDrillPass` from `dynamics-gate.ts`, totally bypassing `evaluateIndependencePass` from `hihat-independence.ts`. Decoupling logic is dead code, and all decoupling results evaluate to `none`.

5. **`generateSequence` is eighth-notes-only.**
   - **REFUTED**: `generateSequence` works fine for Drills 1-4. However, the manually authored sequence in **Drill 5** is mathematically broken. At 90 BPM (666.6ms per beat), the hardcoded sequence uses `250ms, 500ms, 750ms` spacing, which correlates to 240 BPM 16th notes. A drummer playing perfectly in time with the 90 BPM metronome will miss the target zones entirely because the target times are completely unmusical.

6. **Drill 5 pass criteria - 95% AND across timing/dynamics/zone.**
   - **CONFIRMED**: While mechanically possible for a robot, a human drummer cannot pass Drill 5 because of the unmusical hardcoded target times outlined above.

## Git Status

```bash
 M e2e/simulation/simulation-matrix.spec.ts
?? e2e/drill-audit.spec.ts
```

## Git Diff

```diff
warning: in the working copy of 'e2e/simulation/simulation-matrix.spec.ts', LF will be replaced by CRLF the next time Git touches it
diff --git a/e2e/simulation/simulation-matrix.spec.ts b/e2e/simulation/simulation-matrix.spec.ts
index 2ccd96d..da9337f 100644
--- a/e2e/simulation/simulation-matrix.spec.ts
+++ b/e2e/simulation/simulation-matrix.spec.ts
@@ -1,4 +1,6 @@
 import { test, expect } from '../fixtures/virtual-drummer';
+import * as fs from 'fs';
+import * as path from 'path';
 import { drummers } from './drummers';
 import { kits, kitSupportsZones, type Zone } from './kits';
 import { getDrill } from '../../src/data/registry';
@@ -56,7 +58,7 @@ test.describe('Simulation Matrix', () => {
           expect.soft(result.diagnosis).toMatch(result.expected.regex!);
         }
         
-        results.push({
+        const runData: SimulationRun = {
           drummerId: combo.drummerId,
           kitId: combo.kitId,
           drillId: combo.drillId,
@@ -69,15 +71,32 @@ test.describe('Simulation Matrix', () => {
           diagnosisExpected: result.expected.category,
           diagnosisCorrect,
           notes: []
-        });
+        };
+        
+        const rawDir = 'e2e/simulation/reports/raw';
+        if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
+        const finalPath = path.join(rawDir, `${combo.drummerId}-${combo.kitId}-${combo.drillId}-${seed}.json`);
+        const tmpPath = finalPath + '.tmp';
+        fs.writeFileSync(tmpPath, JSON.stringify(runData));
+        fs.renameSync(tmpPath, finalPath);
       });
     }
   }
   
   test.afterAll(() => {
-    if (results.length > 0) {
-      const report = generateReport(results);
-      const outDir = 'e2e/simulation/reports';
+    const rawDir = 'e2e/simulation/reports/raw';
+    const outDir = 'e2e/simulation/reports';
+    if (!fs.existsSync(rawDir)) return;
+    
+    const files = fs.readdirSync(rawDir).filter((f: string) => f.endsWith('.json'));
+    const allResults: SimulationRun[] = [];
+    for (const file of files) {
+      const data = fs.readFileSync(path.join(rawDir, file), 'utf-8');
+      allResults.push(JSON.parse(data));
+    }
+    
+    if (allResults.length > 0) {
+      const report = generateReport(allResults);
       writeJsonReport(report, outDir);
       writeMarkdownReport(report, outDir);
     }
```
