import { describe, it, expect } from 'vitest'
import { DynamicsGateDrill5, evaluateDrillPass } from '../bootcamps/dynamics-gate'
import { DiagnosticRuleId, SCORING_CATEGORIES } from '../../workers/scoring.types'

/**
 * Drill 5 graduation gate: (Timing && Dynamics && Zone) for every note.
 *
 * These replace `e2e/drill-gating.spec.ts`, which was red and, more to the
 * point, tested the wrong thing: it routed through a window hook that discarded
 * the zone diagnostics and called `evaluateIndependencePass` — a hi-hat function
 * that never reads zone data at all. `evaluateDrillPass` is the function that
 * actually enforces the zone rule, and it had no test.
 */

const { GREEN, YELLOW, RED } = SCORING_CATEGORIES

/** Drill 5 is a 4-note sequence: kick, ghost head, rim accent, ghost head. */
const N = DynamicsGateDrill5.sequence.length

const allTiming = (c: number) => Int8Array.from({ length: N }, () => c)
const allDynamics = (v: number) => Int8Array.from({ length: N }, () => v)
const allDiagnostics = (r: number) => Uint8Array.from({ length: N }, () => r)

describe('Drill 5 graduation gate', () => {
  it('sanity: the drill is 4 notes and demands 95%', () => {
    expect(N).toBe(4)
    expect(DynamicsGateDrill5.passCriteria.timingAccuracyPercent).toBe(95)
  })

  it('passes a clean run', () => {
    expect(
      evaluateDrillPass(DynamicsGateDrill5, allTiming(GREEN), allDynamics(1), allDiagnostics(DiagnosticRuleId.OK))
    ).toBe(true)
  })

  it('FAILS on zone confusion despite perfect timing and dynamics', () => {
    // The student hit the snare head softly instead of using the rim for the
    // cross-stick. This is the case the deleted E2E test claimed to prove.
    const diagnostics = allDiagnostics(DiagnosticRuleId.OK)
    diagnostics[2] = DiagnosticRuleId.ZONE_CONFUSION

    expect(
      evaluateDrillPass(DynamicsGateDrill5, allTiming(GREEN), allDynamics(1), diagnostics)
    ).toBe(false)
  })

  it('FAILS on a dynamics miss despite perfect timing and zones', () => {
    const dynamics = allDynamics(1)
    dynamics[1] = 0 // ghost note too loud

    expect(
      evaluateDrillPass(DynamicsGateDrill5, allTiming(GREEN), dynamics, allDiagnostics(DiagnosticRuleId.OK))
    ).toBe(false)
  })

  it('FAILS on a timing miss despite perfect dynamics and zones', () => {
    const timing = allTiming(GREEN)
    timing[3] = RED

    expect(
      evaluateDrillPass(DynamicsGateDrill5, timing, allDynamics(1), allDiagnostics(DiagnosticRuleId.OK))
    ).toBe(false)
  })

  it('accepts YELLOW timing as valid, so the gate is not GREEN-only', () => {
    expect(
      evaluateDrillPass(DynamicsGateDrill5, allTiming(YELLOW), allDynamics(1), allDiagnostics(DiagnosticRuleId.OK))
    ).toBe(true)
  })

  it('is a logical AND — any single failing axis sinks the run', () => {
    // Each axis broken on a different note; none alone is 95%.
    const timing = allTiming(GREEN)
    const dynamics = allDynamics(1)
    const diagnostics = allDiagnostics(DiagnosticRuleId.OK)
    timing[0] = RED
    dynamics[1] = 0
    diagnostics[2] = DiagnosticRuleId.ZONE_CONFUSION

    expect(evaluateDrillPass(DynamicsGateDrill5, timing, dynamics, diagnostics)).toBe(false)
  })

  it('fails an empty run rather than vacuously passing', () => {
    expect(
      evaluateDrillPass(DynamicsGateDrill5, new Int8Array(0), new Int8Array(0), new Uint8Array(0))
    ).toBe(false)
  })
})
