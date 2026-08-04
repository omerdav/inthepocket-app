import { describe, it, expect } from 'vitest'
import {
  HiHatIndependenceDrill5,
  evaluateIndependencePass,
} from '../bootcamps/hihat-independence'
import { SCORING_CATEGORIES } from '../../workers/scoring.types'

/**
 * Foot-hand decoupling gate.
 *
 * Migrated from `e2e/independence-gate.spec.ts`, which booted a browser only
 * to call this pure function through a `window.__E2E_EVALUATE_DRILL5__` hook.
 * That hook shipped in the production bundle and the test exercised a path no
 * user could reach — both of which the Definition of Done rules out. Same
 * assertions, no browser, and the hook is now deleted.
 */

const { GREEN } = SCORING_CATEGORIES
const perfectTiming = Int8Array.from({ length: 8 }, () => GREEN)

describe('Hi-Hat Independence — graduation gate', () => {
  it('fails when the foot perfectly tracks the hands (r = 1.0)', () => {
    const result = evaluateIndependencePass(HiHatIndependenceDrill5, perfectTiming, 1.0)
    expect(result.passed).toBe(false)
    expect(result.message).toContain('foot is following your hand')
  })

  it('passes when the limbs are decoupled (r = 0.2)', () => {
    const result = evaluateIndependencePass(HiHatIndependenceDrill5, perfectTiming, 0.2)
    expect(result.passed).toBe(true)
    expect(result.message).toBe('Passed.')
  })

  it('fails at the threshold boundary, not just far past it', () => {
    const threshold = HiHatIndependenceDrill5.passCriteria.decouplingScoreThreshold!
    expect(evaluateIndependencePass(HiHatIndependenceDrill5, perfectTiming, threshold).passed).toBe(true)
    expect(
      evaluateIndependencePass(HiHatIndependenceDrill5, perfectTiming, threshold + 0.01).passed
    ).toBe(false)
  })

  it('fails on poor timing even when the limbs are independent', () => {
    const badTiming = Int8Array.from({ length: 8 }, () => SCORING_CATEGORIES.MISS)
    const result = evaluateIndependencePass(HiHatIndependenceDrill5, badTiming, 0.1)
    expect(result.passed).toBe(false)
    expect(result.message).toMatch(/timing accuracy/i)
  })

  it('fails an empty run rather than vacuously passing', () => {
    const result = evaluateIndependencePass(HiHatIndependenceDrill5, new Int8Array(0), 0.1)
    expect(result.passed).toBe(false)
  })
})
