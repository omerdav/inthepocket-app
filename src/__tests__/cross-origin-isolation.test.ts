import { describe, it, expect } from 'vitest'
import type { Plugin, PluginOption } from 'vite'
import viteConfig from '../../vite.config'

/**
 * Guards the cross-origin isolation plugin in vite.config.ts.
 *
 * `npm run check:isolation` proves the built app is isolated, but it costs a
 * build and a preview server. This runs in milliseconds on every `npm test`,
 * so deleting the plugin — or fat-fingering a header value — fails in the
 * normal loop rather than at deploy time.
 *
 * It does not assert the plugin merely exists. It runs the middleware and
 * checks what reaches the response, because a hook registered on the wrong
 * lifecycle is exactly the mistake that would otherwise pass a presence check.
 */

const EXPECTED: Record<string, string> = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
}

function flatten(options: PluginOption[]): Plugin[] {
  const out: Plugin[] = []
  for (const option of options) {
    if (!option) continue
    if (Array.isArray(option)) out.push(...flatten(option))
    else out.push(option as Plugin)
  }
  return out
}

/** Run one lifecycle hook against a stub server and collect the headers set. */
function headersFrom(plugin: Plugin, hook: 'configureServer' | 'configurePreviewServer') {
  const handler = plugin[hook]
  expect(handler, `plugin does not implement ${hook}`).toBeTypeOf('function')

  let middleware: ((req: unknown, res: unknown, next: () => void) => void) | undefined
  const server = { middlewares: { use: (fn: typeof middleware) => { middleware = fn } } }

  // Both hooks are plain functions here, not the {order, handler} object form.
  ;(handler as (s: unknown) => void).call(plugin, server)
  expect(middleware, `${hook} registered no middleware`).toBeTypeOf('function')

  const headers: Record<string, string> = {}
  let nextCalled = false
  middleware!(
    {},
    { setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value } },
    () => { nextCalled = true }
  )

  // A middleware that sets headers but never yields hangs every request.
  expect(nextCalled, `${hook} middleware did not call next()`).toBe(true)
  return headers
}

describe('cross-origin isolation headers', () => {
  const plugins = flatten((viteConfig as { plugins: PluginOption[] }).plugins)
  const plugin = plugins.find((p) => p?.name === 'cross-origin-isolation')

  it('is registered in vite.config.ts', () => {
    expect(
      plugin,
      'the cross-origin-isolation plugin is gone: SharedArrayBuffer would be undefined and the timing engine would not start'
    ).toBeDefined()
  })

  // dev covers `npm run dev` and the Playwright webServer; preview covers the
  // production bundle, which is all check:isolation and the E2E suite can see.
  for (const hook of ['configureServer', 'configurePreviewServer'] as const) {
    it(`sets both headers via ${hook}`, () => {
      const headers = headersFrom(plugin!, hook)
      for (const [name, value] of Object.entries(EXPECTED)) {
        expect(headers[name], `${hook} did not set ${name} correctly`).toBe(value)
      }
    })
  }
})
