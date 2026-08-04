import { createDefaultStore } from './db'
import { ProgressionStore } from './ProgressionStore'
import { TelemetryStore } from './TelemetryStore'
import { ProfilesStore } from './ProfilesStore'

/**
 * One database, three stores. Import these rather than constructing your own,
 * so every caller shares a single IndexedDB connection.
 */
const db = createDefaultStore()

export const progressionStore = new ProgressionStore(db)
export const telemetryStore = new TelemetryStore(db)
export const profilesStore = new ProfilesStore(db)

export { db }
export * from './db'
export * from './ProgressionStore'
export * from './TelemetryStore'
export * from './ProfilesStore'
