import { Workbox } from 'workbox-window'

/**
 * Registers the offline shell (8.3).
 *
 * Explicit rather than a snippet injected by vite-plugin-pwa, for two reasons:
 * the update policy below is a real decision that belongs in source where it
 * can be read, and `workbox-window` was already a dependency of this project
 * with nothing importing it.
 */

/** Set once a new build is downloaded and waiting to take over. */
let waiting: Workbox | undefined

export function registerServiceWorker(): void {
  // Dev and E2E run against the dev server, where the plugin emits no worker.
  // Registering there would 404, and worse, a stale worker surviving between
  // Playwright runs would serve yesterday's chunks to a suite that asserts on
  // millisecond timing.
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  const wb = new Workbox('/sw.js')

  // A new build is cached and waiting. Do not activate it here: the drummer
  // may be mid-drill, holding a SharedArrayBuffer against a worklet this
  // update would replace. See `applyPendingUpdate`.
  wb.addEventListener('waiting', () => {
    waiting = wb
  })

  void wb.register()
}

/** True when a newer build is downloaded and held back. */
export function hasPendingUpdate(): boolean {
  return waiting !== undefined
}

/**
 * Apply a held-back update. **Only call this when no drill is running** — it
 * swaps the worklet and worker chunks and reloads, which mid-phrase would look
 * to the drummer exactly like the audio stall of P-1.
 */
export function applyPendingUpdate(): void {
  const wb = waiting
  if (!wb) return
  waiting = undefined
  // Reload once the new worker has actually taken control, not before.
  wb.addEventListener('controlling', () => {
    window.location.reload()
  })
  void wb.messageSkipWaiting()
}
