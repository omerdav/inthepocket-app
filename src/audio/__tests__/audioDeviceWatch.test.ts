import { describe, it, expect, afterEach } from 'vitest'
import {
  explainAudioStall,
  setLastDeviceChangeAt,
  DEVICE_CHANGE_WINDOW_MS,
} from '../audioDeviceWatch'

/**
 * Naming the cause of a stalled drill (register P-1).
 *
 * A drummer whose headset reconnects mid-drill sees "Audio System Interrupted"
 * and has no way to connect that to the headset. They will check their kit,
 * their cable and their sticks first. One sentence turns a dead end into an
 * action — provided it only appears when it is actually plausible.
 */

const NOW = 1_000_000

afterEach(() => setLastDeviceChangeAt(null))

describe('explainAudioStall', () => {
  it('names the device change when one just happened', () => {
    const detail = explainAudioStall(NOW, NOW - 2_000)
    expect(detail).toContain('audio output changed')
    expect(detail, 'must tell them their kit is not the problem').toContain('Nothing is wrong with your kit')
  })

  it('stays generic when no device has changed', () => {
    // Blaming a device change for every stall would make the message
    // worthless — and would be wrong, since the clock can stall for reasons
    // nobody has identified yet.
    expect(explainAudioStall(NOW, null)).toBe('The browser audio engine stalled.')
  })

  it('stays generic when the change was too long ago to be the cause', () => {
    const detail = explainAudioStall(NOW, NOW - (DEVICE_CHANGE_WINDOW_MS + 1))
    expect(detail).toBe('The browser audio engine stalled.')
  })

  it('covers a change during the count-in, not just mid-drill', () => {
    // A drill is 6-10s and the stall is detected ~2s after the clock stops, so
    // a device that vanished as the count-in began is still the likely cause.
    const detail = explainAudioStall(NOW, NOW - 12_000)
    expect(detail).toContain('audio output changed')
  })

  it('hedges rather than asserting causation', () => {
    // The correlation was directly observed, but no single stall can be proven
    // to have this cause. Telling a drummer something certain that turns out
    // to be wrong is worse than something useful that is qualified.
    const detail = explainAudioStall(NOW, NOW - 1_000)
    expect(detail).not.toContain('caused by')
    expect(detail).toContain('will do it')
  })
})
