import { describe, it, expect } from 'vitest'
import type { Plugin, PluginOption } from 'vite'
import viteConfig, { PWA_OPTIONS } from '../../vite.config'

/**
 * Guards the offline shell's configuration (8.3).
 *
 * `npm run check:offline` proves the real manifest contains the real chunks,
 * but it costs a build. This runs in milliseconds and catches the config
 * changes that would quietly hollow the shell out — a glob that stops matching
 * the worklet, a dev-mode worker poisoning the E2E suite, a switch to a
 * generated service worker that ignores src/sw.ts entirely.
 *
 * These are all changes that still build and still ship.
 */

function flatten(options: PluginOption[]): Plugin[] {
  const out: Plugin[] = []
  for (const option of options) {
    if (!option) continue
    if (Array.isArray(option)) out.push(...flatten(option))
    else out.push(option as Plugin)
  }
  return out
}

describe('offline shell', () => {
  const plugins = flatten((viteConfig as { plugins: PluginOption[] }).plugins)

  it('registers the PWA plugin', () => {
    const pwa = plugins.filter((p) => p?.name?.startsWith('vite-plugin-pwa'))
    expect(
      pwa.length,
      'the PWA plugin is gone: no service worker is emitted and the app cannot start offline'
    ).toBeGreaterThan(0)
  })

  it('uses our own service worker, not a generated one', () => {
    // A generated worker would ignore src/sw.ts, taking the deliberate
    // no-skipWaiting policy with it.
    expect(PWA_OPTIONS?.strategies).toBe('injectManifest')
    expect(PWA_OPTIONS?.filename).toBe('sw.ts')
    expect(PWA_OPTIONS?.srcDir).toBe('src')
  })

  it('precaches the script chunks a drill needs', () => {
    // The worklet and the scoring worker are loaded by URL at drill start, not
    // through the import graph. If `js` stops being globbed they vanish from
    // the manifest and the app stalls offline, presenting as P-1.
    const patterns = PWA_OPTIONS?.injectManifest?.globPatterns ?? []
    expect(patterns.length).toBeGreaterThan(0)
    const joined = patterns.join(' ')
    for (const ext of ['js', 'css', 'html', 'woff2']) {
      expect(joined, `globPatterns no longer covers .${ext}`).toContain(ext)
    }
  })

  it('does not precache legacy .woff alongside .woff2', () => {
    const joined = (PWA_OPTIONS?.injectManifest?.globPatterns ?? []).join(' ')
    // Matches a standalone `woff` in the brace list, not the `woff2` inside it.
    expect(/[{,]woff[,}]/.test(joined), '92KB of fonts no browser will request').toBe(false)
  })

  it('stays disabled in dev', () => {
    // Playwright runs `npm run dev`. A worker there would serve stale chunks
    // to a suite asserting on millisecond timing.
    expect(PWA_OPTIONS?.devOptions?.enabled).toBe(false)
  })
})
