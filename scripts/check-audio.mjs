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

if (result.verdict === 'wedged') {
  console.error('')
  console.error(result.reason)
  console.error('This machine cannot run the drill suite. Restart Windows audio')
  console.error('(Audiosrv) or reboot, then re-run. Nothing in the repo is at fault.')
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
