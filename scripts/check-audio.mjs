/**
 * Fails when this machine's Chromium cannot run an audio clock (T-032).
 *
 * WHY: a full product run on 2026-08-24 failed 39 of 87 — every drill-audit
 * row plus 9 dependent timeouts — and the report gave no hint that the cause
 * was environmental. It read exactly like a catastrophic scoring regression.
 * It was not: a clean HEAD reproduced it, and a bare page on about:blank with
 * no application code showed `AudioContext.currentTime` advancing one
 * 512-frame quantum and then freezing.
 *
 * This does not fix that (register P-1, cause still unknown). It turns an hour
 * of bisecting into one line before the suite starts.
 *
 * The judgement lives in ./audio-preflight.mjs so it can be tested without a
 * browser. This file is the browser half and nothing else.
 */
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { SAMPLE_SCHEDULE_MS, evaluate } from './audio-preflight.mjs'

async function measure() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto('about:blank')
    return await page.evaluate(async (schedule) => {
      const ctx = new AudioContext()
      const startWall = performance.now()
      if (ctx.state === 'suspended') await ctx.resume()
      const startAudio = ctx.currentTime
      const results = []
      for (const at of schedule) {
        const toWait = at - (performance.now() - startWall)
        if (toWait > 0) await new Promise((r) => setTimeout(r, toWait))
        results.push({
          wall: performance.now() - startWall,
          audio: (ctx.currentTime - startAudio) * 1000,
        })
      }
      return results
    }, SAMPLE_SCHEDULE_MS)
  } finally {
    // Must complete before the process ends. The first version of this script
    // called process.exit() inside the failure branch, which terminates
    // immediately and skips this close — leaking a Chromium on every failed
    // preflight. In an environment where orphaned Playwright browsers are a
    // suspected factor in the very fault being diagnosed, a probe that leaks
    // one each time you re-run it is worse than useless.
    await browser.close()
  }
}

let measurements
try {
  measurements = await measure()
} catch (err) {
  // R4: the preflight may only stop the suite for the audio condition. A probe
  // that cannot run must never become the reason nothing can run.
  console.error('Audio preflight could not run; continuing.', err instanceof Error ? err.message : err)
  process.exit(0)
}

console.log(' wall(ms)  audio(ms)   ratio')
for (const m of measurements) {
  const ratio = m.audio / m.wall
  console.log(
    `${Math.round(m.wall).toString().padStart(9)}` +
      ` ${m.audio.toFixed(1).padStart(10)}` +
      ` ${ratio.toFixed(3).padStart(8)}`
  )
}

const result = evaluate(measurements)

/**
 * Capture the machine state, but only when the probe fails.
 *
 * P-1 has been "cause unknown" for weeks because every occurrence produced the
 * same single fact — the clock is not advancing — and nothing about the
 * machine at that moment. By the time anyone looks, it has healed. This runs
 * only on failure, so it costs nothing in the normal case, and it collects the
 * things the remaining hypotheses actually turn on:
 *
 *   - which render endpoint Windows considers default, and which are live.
 *     The leading untested theory is that a device change (a headset
 *     connecting, a monitor sleeping) leaves Chromium bound to an endpoint
 *     that has gone away. It would explain transient-and-self-healing.
 *   - how many Chromium processes are around. Orphans from interrupted runs
 *     have been present at every occurrence, and whether they cause it or
 *     merely accompany it is untested.
 *
 * Already eliminated, so nobody re-tests them: the audio-service flags
 * (AudioServiceOutOfProcess, AudioServiceSandbox, --no-sandbox), headless
 * versus headed, having a source wired to the destination, the number of
 * AudioContexts in a page (12 extra changes nothing), the number of browsers
 * holding contexts (6 changes nothing), and `outputLatency` as a signal —
 * it reads 0 on a healthy context too until rendering starts.
 */
function captureMachineState() {
  const ps = (script) => {
    try {
      return execFileSync('powershell', ['-NoProfile', '-Command', script], {
        encoding: 'utf-8', timeout: 15000,
      }).trim()
    } catch (err) {
      return `(could not query: ${err instanceof Error ? err.message : err})`
    }
  }

  console.error('')
  console.error('--- machine state at the moment of failure -------------------')
  console.error('Audio endpoints (Status OK = live):')
  console.error(ps("Get-PnpDevice -Class AudioEndpoint -ErrorAction SilentlyContinue | Where-Object Status -eq 'OK' | Select-Object -ExpandProperty FriendlyName"))
  console.error('')
  console.error('Audio services:')
  console.error(ps("Get-Service Audiosrv,AudioEndpointBuilder | ForEach-Object { $_.Name + ': ' + $_.Status }"))
  console.error('')
  console.error('Chromium processes: ' + ps("(Get-Process chrome -ErrorAction SilentlyContinue).Count"))
  console.error('--------------------------------------------------------------')
  console.error('Paste this into the P-1 register entry. It is the evidence that')
  console.error('every previous occurrence failed to leave behind.')
}

if (result.verdict === 'wedged') {
  console.error('')
  console.error(result.reason)
  console.error('This machine cannot run the drill suite. Restart Windows audio')
  console.error('(Audiosrv) or reboot, then re-run. Nothing in the repo is at fault.')
  captureMachineState()
  process.exitCode = 1
} else if (result.verdict === 'inconclusive') {
  // A misconfigured probe is a broken tool, not a broken machine — so it must
  // not block the suite. It must also not claim everything is fine.
  console.error('')
  console.error(`Audio preflight is misconfigured: ${result.reason}`)
  console.error('Continuing, but this check verified nothing.')
  process.exitCode = 0
} else {
  console.log('')
  console.log(`Audio clock is advancing (${result.judged} sample(s) judged).`)
  process.exitCode = 0
}
