import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { registerServiceWorker } from './registerServiceWorker.ts'
import { profilesStore } from './store'
import { setDynamicsCalibration } from './data/dynamics'
import { errorReporter } from './ErrorReporter.ts'

errorReporter.init()

render(<App />, document.getElementById('app')!)

// Offline shell (8.3). No-op in dev; see registerServiceWorker.
registerServiceWorker()

// Judge dynamics against this drummer's own kit rather than one module's
// factory curve (7.2). Null is the identity, so an uncalibrated drummer and
// the audit's virtual drummer are both unaffected.
void profilesStore.load().then((profile) => {
  setDynamicsCalibration(profile.dynamics)
})
