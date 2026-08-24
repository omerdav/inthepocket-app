/**
 * Fails if the offline shell would not actually work offline.
 *
 * WHY THIS EXISTS: the precache manifest is generated at build time from a
 * glob. Globs silently match nothing. If a chunk stops matching — renamed
 * extension, moved directory, a globPattern edited to look tidier — the build
 * still succeeds, the app still installs, and the failure only appears on a
 * drummer's phone in a room with no signal.
 *
 * The two entries below are the ones that matter. `metronome.worklet` and
 * `ScoringWorker` are loaded by `new AudioWorkletNode(...)` and
 * `new Worker(...)` at drill start, not by the import graph. Without them the
 * app opens, renders, counts in, and stalls — presenting as P-1, a known
 * intermittent nobody would think to blame on the cache.
 *
 * Run against a real build: `npm run check:offline`.
 */
import { readFileSync, existsSync } from 'node:fs'

const SW = 'dist/sw.js'

/** Substring → why it must be on disk before the network goes away. */
const REQUIRED = {
  'metronome.worklet': 'the metronome AudioWorklet — no click, no drill',
  'ScoringWorker': 'the scoring worker — a drill that cannot be graded',
  'index.html': 'the app shell itself',
  '.css': 'stylesheet',
}

if (!existsSync(SW)) {
  console.error(`✗ ${SW} not found. Run a build first.`)
  process.exit(1)
}

const source = readFileSync(SW, 'utf-8')
const urls = [...source.matchAll(/"url":\s*"([^"]+)"/g)].map((m) => m[1])

if (urls.length === 0) {
  console.error(`✗ ${SW} contains no precache manifest at all.`)
  process.exit(1)
}

console.log(`Precache manifest: ${urls.length} entries`)

let failed = false
for (const [needle, why] of Object.entries(REQUIRED)) {
  const hit = urls.find((u) => u.includes(needle))
  if (hit) {
    console.log(`✓ ${needle.padEnd(20)} ${hit}`)
  } else {
    console.error(`✗ ${needle.padEnd(20)} MISSING — ${why}`)
    failed = true
  }
}

// Precaching .woff alongside .woff2 doubles the font download for no benefit;
// every browser with AudioWorklet takes the .woff2. Catch it coming back.
const woff = urls.filter((u) => u.endsWith('.woff'))
if (woff.length) {
  console.error(`✗ ${woff.length} legacy .woff file(s) precached — dead weight, see globPatterns`)
  failed = true
} else {
  console.log('✓ no legacy .woff precached')
}

console.log(failed ? '\nThe offline shell is incomplete.' : '\nOffline shell is complete.')
process.exit(failed ? 1 : 0)
