/**
 * Notices when the machine's audio devices change, so a stalled drill can say
 * *why* (register P-1).
 *
 * P-1 was "the audio clock wedges, cause unknown" for weeks. On 2026-08-26 the
 * probe captured the machine at the moment it happened: every Jabra endpoint
 * that was live an hour earlier had gone, and the remaining endpoints had been
 * re-enumerated. **The audio output device disappeared underneath a running
 * Chromium**, and the clock froze at exactly one 512-frame buffer.
 *
 * That is not a fault this app can prevent. It is one it can *name*. A drummer
 * whose headset reconnects mid-drill currently sees "Audio System Interrupted",
 * which tells them nothing and points at nothing — they will check their kit,
 * their cable and their sticks before they think of the headset that just
 * connected. One sentence turns a dead end into an action.
 */

/**
 * How recently a device change counts as the likely explanation.
 *
 * A drill is 6–10 seconds and the stall is detected within 2s of the clock
 * stopping, so a change in the last half minute is a plausible cause. Much
 * wider and it would start blaming a headset someone plugged in before they
 * sat down; much narrower and it would miss the case where the device goes
 * during the count-in.
 */
export const DEVICE_CHANGE_WINDOW_MS = 30_000

let lastChangeAt: number | null = null
let stop: (() => void) | null = null

/** Begin watching. Safe to call more than once; the second call is a no-op. */
export function watchAudioDevices(now: () => number = () => Date.now()): void {
  if (stop) return
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return

  const onChange = () => {
    lastChangeAt = now()
  }
  navigator.mediaDevices.addEventListener('devicechange', onChange)
  stop = () => {
    navigator.mediaDevices.removeEventListener('devicechange', onChange)
    stop = null
  }
}

export function stopWatchingAudioDevices(): void {
  stop?.()
  lastChangeAt = null
}

/** For tests and for the explanation below. */
export function lastDeviceChangeAt(): number | null {
  return lastChangeAt
}

/** Test seam. */
export function setLastDeviceChangeAt(at: number | null): void {
  lastChangeAt = at
}

/**
 * The detail line for a stalled drill.
 *
 * Deliberately hedged — "changed just now" rather than "caused by". The
 * correlation is strong and was directly observed, but this cannot prove
 * causation for any particular stall, and telling a drummer something certain
 * that turns out to be wrong is worse than telling them something useful that
 * is qualified.
 */
export function explainAudioStall(
  nowMs: number,
  changedAt: number | null = lastChangeAt
): string {
  if (changedAt !== null && nowMs - changedAt <= DEVICE_CHANGE_WINDOW_MS) {
    return (
      'Your computer’s audio output changed just now — a headset connecting or ' +
      'disconnecting will do it. That stops the audio clock, and the drill with ' +
      'it. Nothing is wrong with your kit. Pick a fixed output device and try ' +
      'again.'
    )
  }
  return 'The browser audio engine stalled.'
}
