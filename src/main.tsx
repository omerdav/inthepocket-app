import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { registerServiceWorker } from './registerServiceWorker.ts'
import { profilesStore } from './store'
import { setDynamicsCalibration } from './data/dynamics'
import { midiEngine } from './audio/midi'
import { errorReporter } from './ErrorReporter.ts'

errorReporter.init()

render(<App />, document.getElementById('app')!)

// Offline shell (8.3). No-op in dev; see registerServiceWorker.
registerServiceWorker()

/**
 * Apply this drummer's kit profile before any MIDI arrives.
 *
 * Both halves at boot rather than at drill start. The note map (7.3) because a
 * drummer navigates the menus with their sticks too — a Roland whose pads only
 * work once a drill begins cannot reach the drill in the first place. The
 * dynamics thresholds (7.2) for symmetry, and because the calibration screen
 * itself should reflect what is already stored.
 *
 * Both are the identity when unset, so an uncalibrated drummer and the audit's
 * virtual drummer are unaffected by either.
 */
void profilesStore.load().then((profile) => {
  midiEngine.setNoteMap(profile.noteMap)
  setDynamicsCalibration(profile.dynamics)
})
