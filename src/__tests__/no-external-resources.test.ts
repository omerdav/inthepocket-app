import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname, sep } from 'node:path'

/**
 * Fails if the app fetches a subresource from another origin.
 *
 * WHY: the app is cross-origin isolated (`require-corp`, see 8.1), so every
 * subresource needs a CORP header or it is blocked outright — and it is meant
 * to run offline from the home screen, where a third-party request fails no
 * matter what headers it carries. A Google Fonts @import was the last one; it
 * is now bundled (8.2).
 *
 * This checks *fetching positions* only — `@import`, `url()`, `href`, `src`.
 * A documentation link in a comment is fine and stays fine; an SVG `xmlns`
 * namespace is a URI, not a request, and is not an attribute this matches.
 */

const ROOT = join(import.meta.dirname, '..', '..')
const SCAN_DIRS = [join(ROOT, 'src')]
const SCAN_FILES = [join(ROOT, 'index.html')]
const EXTENSIONS = new Set(['.css', '.html', '.ts', '.tsx', '.svg'])

/**
 * Documented exceptions. Same shape as `no-e2e.test.ts`'s allowlist and the
 * same rule: adding one is a decision that needs a reason next to it, not a
 * quick way to get a green run. Empty is the target state.
 */
const ALLOWED: Record<string, string> = {}

/** Fetching positions: @import "URL", url(URL), href="URL", src="URL". */
const PATTERNS: Array<[string, RegExp]> = [
  ['@import', /@import\s+(?:url\()?\s*['"]?(https?:\/\/[^'")\s]+)/gi],
  ['url()', /\burl\(\s*['"]?(https?:\/\/[^'")\s]+)/gi],
  ['href', /\bhref\s*=\s*['"](https?:\/\/[^'"]+)/gi],
  ['src', /\bsrc\s*=\s*['"](https?:\/\/[^'"]+)/gi],
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.has(extname(full))) out.push(full)
  }
  return out
}

function findExternalReferences() {
  const files = [...SCAN_DIRS.flatMap((d) => walk(d)), ...SCAN_FILES]
  const found: Array<{ file: string; kind: string; url: string }> = []

  for (const file of files) {
    const text = readFileSync(file, 'utf-8')
    const rel = relative(ROOT, file).split(sep).join('/')
    for (const [kind, pattern] of PATTERNS) {
      pattern.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = pattern.exec(text)) !== null) {
        found.push({ file: rel, kind, url: m[1] })
      }
    }
  }
  return { found, fileCount: files.length }
}

describe('no external subresources', () => {
  const { found, fileCount } = findExternalReferences()

  it('scans a meaningful number of files', () => {
    // Guards the guard: a broken walk() would silently pass everything.
    expect(fileCount).toBeGreaterThan(10)
  })

  it('fetches nothing from another origin', () => {
    const violations = found.filter((f) => !ALLOWED[f.url])
    expect(
      violations,
      violations.length
        ? `External subresource(s) found — blocked by require-corp and unavailable offline:\n` +
          violations.map((v) => `  ${v.file}: ${v.kind} → ${v.url}`).join('\n')
        : ''
    ).toEqual([])
  })

  it('has no stale entries in the allowlist', () => {
    // An exception that no longer matches anything is a rule nobody is obeying.
    for (const url of Object.keys(ALLOWED)) {
      expect(found.some((f) => f.url === url), `ALLOWED entry "${url}" matches nothing`).toBe(true)
    }
    expect(Object.keys(ALLOWED).length, 'the target state is zero exceptions').toBe(0)
  })
})
