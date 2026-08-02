import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    crossOriginIsolation(),
  ],
})
