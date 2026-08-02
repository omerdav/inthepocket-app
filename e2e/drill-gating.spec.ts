import { test, expect } from '@playwright/test';
import { DiagnosticRuleId, SCORING_CATEGORIES } from '../src/workers/scoring.types';

test.describe('Drill 5 Graduation Gate (Logical AND Failure Test)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('Fails explicit graduation gate if Zone is confused, despite perfect timing and dynamics', async ({ page }) => {
    
    // We will simulate the arrays returned by the ScoringWorker for Drill 5.
    // Drill 5 sequence: 4 notes.
    // Note 1: Kick
    // Note 2: Snare Head
    // Note 3: Snare Rim (Cross-stick)
    // Note 4: Snare Head
    
    // We will simulate perfect timing (all GREEN - 0)
    const timingScores = [0, 0, 0, 0];
    
    // We will simulate perfect dynamic contrast (all PASS - 1)
    const dynamicScores = [1, 1, 1, 1];
    
    // We will simulate a Zone Confusion on the 3rd note (hit snare head instead of rim)
    const diagnosticRuleIds = [
      DiagnosticRuleId.OK, 
      DiagnosticRuleId.OK, 
      DiagnosticRuleId.ZONE_CONFUSION, // The failure!
      DiagnosticRuleId.OK
    ];

    const passResult = await page.evaluate(({ timing, dynamics, diagnostics }) => {
      // Int8Array / Uint8Array serialization boundary over Playwright bridge requires mapping arrays
      const timingArr = new Int8Array(timing);
      const dynamicsArr = new Int8Array(dynamics);
      const diagArr = new Uint8Array(diagnostics);
      
      return (window as any).__E2E_EVALUATE_DRILL5__(timingArr, dynamicsArr, diagArr);
    }, { timing: timingScores, dynamics: dynamicScores, diagnostics: diagnosticRuleIds });

    // Assert that the app explicitly FAILS the user because of the Zone Confusion,
    // proving the graduation gate correctly enforces (Timing && Dynamics && Zone)
    expect(passResult).toBe(false);
  });

});
