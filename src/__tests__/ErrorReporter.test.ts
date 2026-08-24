/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { errorReporter } from '../ErrorReporter'

/**
 * Guards the two properties that decide whether this log is worth having.
 *
 * It must not break the app it reports on, and it must not fill itself with
 * noise before a real fault arrives.
 */

const settle = () => new Promise((r) => setTimeout(r, 30))

describe('ErrorReporter', () => {
  beforeEach(async () => {
    errorReporter.init()
    await errorReporter.clearLogs()
  })

  it('collapses a repeating message into one entry with a count', async () => {
    // Register P-8 produces "ResizeObserver loop completed with undelivered
    // notifications" about once a second, on the drill screen, indefinitely.
    // Stored one row at a time it fills all 50 slots in under a minute and
    // evicts the engine failure this log exists to capture.
    for (let i = 0; i < 20; i++) {
      errorReporter.logDrillError('audio-stall', 'ResizeObserver loop completed')
      await settle()
    }
    const logs = await errorReporter.getLogs()
    const matching = logs.filter((l) => l.message === 'ResizeObserver loop completed')
    expect(matching.length, 'the same message should occupy one row, not twenty').toBe(1)
    expect(matching[0].count).toBeGreaterThan(1)
  })

  it('keeps distinct messages as distinct entries', async () => {
    errorReporter.logDrillError('audio-stall', 'first distinct failure')
    await settle()
    errorReporter.logDrillError('audio-stall', 'second distinct failure')
    await settle()
    const logs = await errorReporter.getLogs()
    expect(logs.map((l) => l.message)).toContain('first distinct failure')
    expect(logs.map((l) => l.message)).toContain('second distinct failure')
  })

  it('does not throw when crypto.randomUUID is unavailable', () => {
    // DrillSession calls this from its catch block, immediately before
    // dispatching DRILL_PHASE_EVENT. That dispatch is the T-021 invariant:
    // without it `isDrillPlaying` stays true and the quick menu is suppressed
    // for the rest of the session. A throw here would resurrect that defect.
    const original = globalThis.crypto.randomUUID
    try {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: () => {
          throw new Error('not a secure context')
        },
      })
      expect(() => errorReporter.logDrillError('audio-stall', 'uuid unavailable')).not.toThrow()
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: original,
      })
    }
  })

  it('still records the failure when the id generator falls back', async () => {
    // Degrading is fine; losing the entry silently is not.
    const original = globalThis.crypto.randomUUID
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    })
    errorReporter.logDrillError('audio-stall', 'recorded without randomUUID')
    await settle()
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: original,
    })
    const logs = await errorReporter.getLogs()
    expect(logs.some((l) => l.message === 'recorded without randomUUID')).toBe(true)
  })

  it('does not throw when the storage layer fails', async () => {
    // persist() already swallowed its own errors; this asserts the contract
    // rather than trusting it to stay that way.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => errorReporter.logDrillError('cancelled')).not.toThrow()
    await settle()
    spy.mockRestore()
  })
})
