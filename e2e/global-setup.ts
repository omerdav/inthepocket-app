import { execSync } from 'child_process';

export default function globalSetup() {
  try {
    console.log('Running audio preflight check...');
    execSync('node scripts/check-audio.mjs', { stdio: 'inherit' });
  } catch (err) {
    // execSync throws if the process exits with a non-zero status code.
    if (err.status === 1) {
      throw new Error('Audio preflight failed: The audio clock is wedged. Please restart Windows audio (Audiosrv) or reboot the machine.');
    }
    // If it fails for any other reason (e.g. status 0 but threw, or some other status), we let it proceed.
    console.log('Audio preflight could not run, continuing suite...');
  }
}
