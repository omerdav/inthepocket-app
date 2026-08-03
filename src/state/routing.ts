import { signal } from '@preact/signals'
import { DEFAULT_DRILL_ID, getDrill } from '../data/registry'

/**
 * Deep-link routing for the active drill: `/?drill=<id>`.
 *
 * Deliberately real routing rather than a `window.__SET_DRILL__` test hook.
 * A hook would put test scaffolding back into the production bundle — the
 * pattern flagged in Verified_Status_Audit §3.8 — and would mean the test
 * suite exercises a path no user can reach. A URL is a real product feature
 * (shareable, bookmarkable, back-button-able) that tests happen to be able
 * to use.
 */

export const DRILL_PARAM = 'drill'

function readDrillFromUrl(): string {
  if (typeof location === 'undefined') return DEFAULT_DRILL_ID
  const requested = new URLSearchParams(location.search).get(DRILL_PARAM)
  // Fall back rather than render nothing if the id is unknown or stale.
  return getDrill(requested) ? requested! : DEFAULT_DRILL_ID
}

export const currentDrillId = signal<string>(readDrillFromUrl())

/**
 * Set to a drill id when that drill should begin as soon as it is mounted.
 *
 * A signal rather than an event, because selecting a *different* drill
 * remounts DrillSession — an event dispatched synchronously with the
 * navigation fires before the new component exists and is silently lost.
 * The consumer clears it once consumed.
 */
export const pendingLaunchId = signal<string | null>(null)

export interface NavigateOptions {
  /**
   * Start the drill on arrival. This is the stick-driven path: a drummer
   * selecting a drill with a rim hit has no way to then press "Start".
   */
  autoStart?: boolean
  /** Replace rather than push, to avoid polluting history on initial sync. */
  replace?: boolean
}

export function navigateToDrill(id: string, options: NavigateOptions = {}): void {
  if (!getDrill(id)) return

  if (typeof location !== 'undefined' && typeof history !== 'undefined') {
    const url = new URL(location.href)
    url.searchParams.set(DRILL_PARAM, id)
    if (options.replace) history.replaceState({ drill: id }, '', url)
    else history.pushState({ drill: id }, '', url)
  }

  currentDrillId.value = id

  if (options.autoStart) {
    pendingLaunchId.value = id
  }
}

/** Keep the signal in step with browser back/forward. */
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    currentDrillId.value = readDrillFromUrl()
  })
}
