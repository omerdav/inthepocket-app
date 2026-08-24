import { execSync } from 'node:child_process'

/**
 * Stops the suite when this machine cannot run an audio clock (T-032).
 *
 * Without this, a wedged clock produces 39 failures across the drill audit and
 * every dependent spec, none of which name the cause. See register P-1.
 */
export default function globalSetup() {
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
          're-run. Nothing in the repo is at fault — see P-1 in the defect register.'
      )
    }
    // R4: the preflight may only stop the suite for the audio condition. Any
    // other failure — probe missing, browser refused to launch, timeout — is a
    // broken tool, and a broken tool must not be why nothing can run.
    console.log('Audio preflight could not run, continuing suite...')
  }
}
