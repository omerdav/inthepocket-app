import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { registerServiceWorker } from './registerServiceWorker.ts'
import { profilesStore } from './store'
import { midiEngine } from './audio/midi'
import { errorReporter } from './ErrorReporter.ts'

errorReporter.init()

render(<App />, document.getElementById('app')!)

// Offline shell (8.3). No-op in dev; see registerServiceWorker.
registerServiceWorker()

// Apply this kit's note map before any MIDI arrives (7.3, register P-3).
//
// At boot rather than at drill start, because a drummer navigates the menus
// with their sticks too — a Roland whose pads are only mapped once a drill
// begins cannot reach the drill in the first place.
void profilesStore.load().then((profile) => {
  midiEngine.setNoteMap(profile.noteMap)
})
