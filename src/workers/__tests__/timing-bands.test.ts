import { describe, it, expect } from 'vitest'
import { categoriseTiming, DEFAULT_TIMING_WINDOW_MS } from '../timingBands'
import { SCORING_CATEGORIES } from '../scoring.types'

const { GREEN, YELLOW, RED } = SCORING_CATEGORIES

describe('categoriseTiming', () => {
  it('is green on the beat', () => {
    expect(categoriseTiming(0, 30)).toBe(GREEN)
  })

  it('treats early and late symmetrically', () => {
    expect(categoriseTiming(-20, 30)).toBe(GREEN)
    expect(categoriseTiming(20, 30)).toBe(GREEN)
    expect(categoriseTiming(-45, 30)).toBe(YELLOW)
    expect(categoriseTiming(45, 30)).toBe(YELLOW)
  })

  it('includes the window boundary in green', () => {
    // A drill promising "within 30ms" must accept exactly 30ms.
    expect(categoriseTiming(30, 30)).toBe(GREEN)
    expect(categoriseTiming(30.01, 30)).toBe(YELLOW)
  })

  it('extends yellow to 5/3 of the green window, then red', () => {
    expect(categoriseTiming(50, 30)).toBe(YELLOW)
    expect(categoriseTiming(50.01, 30)).toBe(RED)
  })

  it('scales with the drill tolerance rather than a fixed threshold', () => {
    // 40ms is green for a lenient beginner drill...
    expect(categoriseTiming(40, 50)).toBe(GREEN)
    // ...and red for the strict graduation gate.
    expect(categoriseTiming(40, 20)).toBe(RED)
  })

  it('falls back to the historical 30/50 banding when no window is given', () => {
    expect(DEFAULT_TIMING_WINDOW_MS).toBe(30)
    expect(categoriseTiming(30)).toBe(GREEN)
    expect(categoriseTiming(50)).toBe(YELLOW)
    expect(categoriseTiming(51)).toBe(RED)
  })
})
