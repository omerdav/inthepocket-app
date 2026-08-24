import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PWA_OPTIONS } from '../../vite.config'

/**
 * Guards the installed app (8.4).
 *
 * Installability is not cosmetic here. Chrome grants an installed PWA
 * autoplay, which is what lets the engine-warmup screen skip its
 * `awaiting-tap` step — so a manifest that quietly stops qualifying puts the
 * opening tap back for every drummer, and nothing else would fail.
 *
 * Chrome's install criteria are the assertions below: a name, a start_url,
 * `display` in a standalone family, and both a 192px and a 512px icon.
 */

const ROOT = join(import.meta.dirname, '..', '..')
const manifest = typeof PWA_OPTIONS?.manifest === 'object' ? PWA_OPTIONS.manifest : undefined

describe('installability', () => {
  it('ships a web app manifest', () => {
    expect(manifest, 'no manifest: the app cannot be installed and the opening tap stays').toBeDefined()
  })

  it('declares the fields Chrome requires to offer installation', () => {
    expect(manifest?.name).toBeTruthy()
    expect(manifest?.short_name).toBeTruthy()
    expect(manifest?.start_url).toBeTruthy()
  })

  it('runs standalone, which is what grants autoplay', () => {
    // 'browser' would still be a valid manifest and would silently reinstate
    // the tap, because the app would no longer be treated as installed.
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest?.display)
  })

  it('provides the 192px and 512px icons the install prompt needs', () => {
    const icons = manifest?.icons ?? []
    for (const size of ['192x192', '512x512']) {
      // Must be a normal icon, not only the maskable one. A maskable icon is
      // drawn with its safe-zone padding and gets visibly cropped when used
      // where a plain icon was expected — and `maskable-icon-512x512.png` is
      // itself 512, so a check that ignored purpose would pass with the real
      // 512 icon deleted.
      expect(
        icons.some((i) => i.sizes === size && i.purpose !== 'maskable'),
        `no plain ${size} icon — Chrome will not offer to install`
      ).toBe(true)
    }
  })

  it('provides a maskable icon so Android does not letterbox it', () => {
    const icons = manifest?.icons ?? []
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('every icon the manifest names actually exists', () => {
    // A manifest naming a file that was never generated fails at install time,
    // on a device, silently — the icon simply does not appear.
    const missing = (manifest?.icons ?? [])
      .map((i) => i.src)
      .filter((src) => !existsSync(join(ROOT, 'public', src)))
    expect(missing, `manifest names icons that are not in public/: ${missing.join(', ')}`).toEqual([])
  })

  it('index.html carries the iOS icon and the theme colour', () => {
    // iOS largely ignores the manifest's icons array, so apple-touch-icon is
    // not redundant with the entries above.
    // Match the tags, not the words. The comment above them in index.html
    // names both, so a substring check passes with the markup deleted.
    const html = readFileSync(join(ROOT, 'index.html'), 'utf-8')
    expect(
      /<link[^>]+rel=["']apple-touch-icon["'][^>]*>/.test(html),
      'no apple-touch-icon link: iOS home screen gets a screenshot'
    ).toBe(true)
    expect(
      /<meta[^>]+name=["']theme-color["'][^>]*>/.test(html),
      'no theme-color meta: a bright status bar above a dark app'
    ).toBe(true)
  })
})
