/**
 * Fails if the production bundle is not cross-origin isolated.
 *
 * WHY THIS EXISTS: the E2E suite asserts `crossOriginIsolated === true`, but
 * Playwright starts `npm run dev`, so that assertion only ever covered the dev
 * server. Nothing checked the built artifact.
 *
 * Without both headers `SharedArrayBuffer` is undefined, the timing bridge
 * between the main thread, the AudioWorklet and the ScoringWorker cannot be
 * built, and the app dies — in production only, while working perfectly on
 * every developer machine.
 *
 * Uses Vite's Node API rather than spawning `vite preview`. A spawned shell
 * leaves the real server orphaned on Windows, and the first version of this
 * script duly validated a stale server from a previous run — it reported a
 * pass with the headers removed. Holding the server object means close() is
 * real, and the port is verified free first so a leftover can never stand in
 * for the build under test.
 *
 * What this does NOT prove: `vite preview` sends these headers because
 * vite.config.ts says so. A real host will not, unless configured — see
 * public/_headers.
 */
import { preview } from 'vite'
import net from 'node:net'

const PORT = 4173
const REQUIRED = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
}

const portInUse = await new Promise((resolve) => {
  const probe = net.createServer()
  probe.once('error', () => resolve(true))
  probe.once('listening', () => probe.close(() => resolve(false)))
  probe.listen(PORT, '127.0.0.1')
})

if (portInUse) {
  console.error(`✗ Port ${PORT} is already in use.`)
  console.error('  Refusing to run: the check would validate that server, not this build.')
  process.exit(1)
}

const server = await preview({ preview: { port: PORT, strictPort: true } })

let failed = false
try {
  const res = await fetch(`http://localhost:${PORT}/`)
  for (const [header, expected] of Object.entries(REQUIRED)) {
    const actual = res.headers.get(header)
    if (actual !== expected) {
      console.error(`✗ ${header}: expected "${expected}", got ${actual === null ? 'NO HEADER' : `"${actual}"`}`)
      failed = true
    } else {
      console.log(`✓ ${header}: ${actual}`)
    }
  }
} finally {
  await server.close()
}

if (failed) {
  console.error('\nThe production build is NOT cross-origin isolated.')
  console.error('SharedArrayBuffer would be undefined and the timing engine would not start.')
} else {
  console.log('\nProduction build is cross-origin isolated.')
}
process.exit(failed ? 1 : 0)
