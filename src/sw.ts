/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

/**
 * The offline shell (8.3).
 *
 * M8's exit criterion is a drummer launching from the home screen with no
 * network and completing a full session. That needs every asset a drill
 * touches to be on disk before the network disappears — not cached lazily on
 * first use, because "first use" may be the moment they are already offline.
 *
 * So this precaches the whole build. It is 413KB; there is nothing to be
 * clever about.
 *
 * THE TWO ASSETS THAT MATTER MOST are the ones easiest to miss:
 * `metronome.worklet-*.js` and `ScoringWorker-*.js`. They are separate chunks
 * loaded by `new AudioWorkletNode(...)` and `new Worker(...)` at drill start,
 * not imports the bundler wires into the entry. If either is absent the app
 * still opens, still renders, still counts you in — and then stalls exactly
 * like P-1. An offline failure that looks like a known intermittent is the
 * worst outcome available here, so `src/__tests__/precache-manifest.test.ts`
 * asserts both are in the manifest.
 */

declare const self: ServiceWorkerGlobalScope

/**
 * Injected at build time by vite-plugin-pwa (injectManifest). Every entry
 * carries a revision hash, so a changed asset busts its own cache.
 */
precacheAndRoute(self.__WB_MANIFEST)

/** Drop caches from earlier Workbox versions rather than leaking them forever. */
cleanupOutdatedCaches()

/**
 * Single-page app: any navigation resolves to the precached shell. Without
 * this, a reload on a deep link offline gets the browser's dinosaur.
 */
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

/**
 * Deliberately NOT skipWaiting().
 *
 * The usual PWA default is for a new service worker to take over immediately.
 * Here that means swapping the worklet and worker chunks under a drill that is
 * already running and already holding a SharedArrayBuffer — mid-phrase, while
 * the drummer is playing. A new build waits instead, and takes over on the
 * next full load.
 *
 * The app can hurry that along when it knows nothing is playing, by posting
 * SKIP_WAITING. `DrillSession` is the only place that can honestly claim to
 * know that, so the decision lives there and not here.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
