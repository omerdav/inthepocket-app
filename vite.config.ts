import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

/**
 * Vite plugin that injects Cross-Origin Isolation headers on every response.
 *
 * WHY: SharedArrayBuffer (used for zero-latency audio timing data shared
 * between the main thread, AudioWorklets, and Web Workers) is only available
 * in cross-origin-isolated contexts. The browser requires BOTH of these
 * headers to enable that context:
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 * Without them, `new SharedArrayBuffer(...)` throws at runtime.
 */
function crossOriginIsolation(): Plugin {
  return {
    name: 'cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })
    },
  }
}

/**
 * Exported so `src/__tests__/offline-shell.test.ts` can assert on it. These
 * are decisions with consequences a build error would not catch — a glob that
 * stops matching the worklet still builds, and still ships.
 */
export const PWA_OPTIONS: Parameters<typeof VitePWA>[0] = {
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  /**
   * We register explicitly with `workbox-window` in main.tsx rather than
   * letting the plugin inject a snippet, so the registration is visible in
   * source and can decide for itself when an update may be applied.
   */
  injectRegister: null,
  /** 8.4 owns the web app manifest. This task is precaching only. */
  manifest: false,
  injectManifest: {
    /**
     * `.woff` is deliberately absent. Fontsource emits both formats in one
     * `src:` list and every browser that has AudioWorklet and
     * SharedArrayBuffer takes the `.woff2`, so the `.woff` files are never
     * requested — precaching them would add 92KB of downloads that no drummer
     * will ever use.
     */
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
  },
  /**
   * Off in dev. Playwright runs `npm run dev`, and a service worker serving
   * yesterday's chunks to a suite that asserts on millisecond timing is a
   * source of failures nobody would attribute correctly.
   */
  devOptions: { enabled: false },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    crossOriginIsolation(),
    /**
     * Offline shell (8.3). `injectManifest`, not `generateSW`: the service
     * worker is ours (`src/sw.ts`) and the plugin only injects the precache
     * list into it. A generated worker would be a black box in the one part of
     * the app whose failure mode is indistinguishable from P-1.
     */
    VitePWA(PWA_OPTIONS),
  ],
})
