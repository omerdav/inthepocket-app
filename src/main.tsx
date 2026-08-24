import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { registerServiceWorker } from './registerServiceWorker.ts'

render(<App />, document.getElementById('app')!)

// Offline shell (8.3). No-op in dev; see registerServiceWorker.
registerServiceWorker()
