import { execSync } from 'node:child_process'
import { startServerWatch } from './server-watch'

/**
 * The one sanctioned way past the gate: `ITP_SKIP_AUDIO_PREFLIGHT=1`.
 *
 * P-1 wedges this machine's audio clock for hours at a time and is **not our
 * code** — a USB audio endpoint re-enumerates underneath a running Chromium and
 * the render stream freezes after one 512-frame buffer. While that lasts no
 * drill can complete, because the engine schedules against
 * `AudioContext.currentTime` and it does not advance.
 *
 * The gate exists so that state produces one named failure instead of thirty
 * unattributed ones, and that remains the right default. But it also blocks work
 * on the many specs that never touch audio — navigation, settings, session
 * entry. This unblocks those, and nothing more.
 *
 * It is deliberately loud, and it does **not** make a red suite acceptable: any
 * drill spec will still fail, and those failures are P-1 rather than
 * regressions. **Never use it to call a suite green.**
 */
function preflightSkipped(): boolean {
  if (process.env.ITP_SKIP_AUDIO_PREFLIGHT !== '1') return false
  console.warn(
    [
      '',
      '⚠️  AUDIO PREFLIGHT SKIPPED (ITP_SKIP_AUDIO_PREFLIGHT=1).',
      '   Any drill that stalls is P-1 on this machine, not a regression — and a',
      '   pass here is NOT evidence the suite is green. Re-run without this',
      '   variable before trusting any result.',
      '',
    ].join('\n')
  )
  return true
}

/**
 * Stops the suite when this machine cannot run an audio clock (T-032).
 *
 * Without this, a wedged clock produces 39 failures across the drill audit and
 * every dependent spec, none of which name the cause. See register P-1.
 */
export default function globalSetup() {
  if (preflightSkipped()) return startWatchSafely()

  console.log('Running audio preflight check...')
  try {
    execSync('node scripts/check-audio.mjs', {
      stdio: 'inherit',
      // A probe that hangs must not hang the suite forever. The measurement
      // itself takes ~3s; 60s is browser launch plus a wide margin.
      timeout: 60_000,
    })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 1) {
      throw new Error(
        'Audio preflight failed: the audio clock on this machine is not advancing, so ' +
          'every drill would stall. Restart Windows audio (Audiosrv) or reboot, then ' +
          're-run. Nothing in the repo is at fault — see P-1 in the defect register. ' +
          'To run the specs that do not need audio, set ITP_SKIP_AUDIO_PREFLIGHT=1.'
      )
    }
    // R4: the preflight may only stop the suite for the audio condition. Any
    // other failure — probe missing, browser refused to launch, timeout — is a
    // broken tool, and a broken tool must not be why nothing can run.
    console.log('Audio preflight could not run, continuing suite...')
  }

  return startWatchSafely()
}

function startWatchSafely() {
  try {
    return startServerWatch()
  } catch (err) {
    console.error('Server watcher failed to start, ignoring...', err)
  }
}
