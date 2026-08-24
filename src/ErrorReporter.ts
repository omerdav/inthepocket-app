import { WebMidi } from 'webmidi'
import { db, STORE_ERRORS } from './store'
import { DRILL_PHASE_EVENT, type DrillPhaseDetail } from './session/DrillRunner'

export interface ErrorRecord {
  id: string
  timestamp: number
  message: string
  drillId: string | null
  phase: string
  midiConnected: boolean
  /** How many times this message repeated. See COLLAPSE_WINDOW_MS. */
  count: number
  /** When it was last seen. Differs from `timestamp` once `count` climbs. */
  lastTimestamp: number
}

const MAX_LOGS = 50

/**
 * Repeats of the same message inside this window are collapsed into a count
 * rather than stored again.
 *
 * NOT a micro-optimisation. Register P-8: `RhythmGrid` writes layout inside
 * its own ResizeObserver callback and emits
 * "ResizeObserver loop completed with undelivered notifications" roughly once
 * a second, continuously, on the real drill screen. Without collapsing, that
 * one benign message fills all 50 slots in under a minute and evicts the
 * engine failure this log exists to capture — and does an IndexedDB read,
 * sort and write every second while the drummer is playing.
 *
 * Ten seconds is long enough to flatten a repeating fault and short enough
 * that a genuinely recurring one still shows its rhythm in the timestamps.
 */
const COLLAPSE_WINDOW_MS = 10_000

class ErrorReporter {
  private currentDrillId: string | null = null
  private currentPhase: string = 'idle'
  private _initialized = false
  
  init() {
    if (this._initialized) return
    this._initialized = true

    window.addEventListener(DRILL_PHASE_EVENT, (e: Event) => {
      const detail = (e as CustomEvent<DrillPhaseDetail>).detail
      this.currentPhase = detail.phase
      if (detail.unitId) this.currentDrillId = detail.unitId
      if (detail.phase === 'idle') this.currentDrillId = null
    })
    
    window.addEventListener('error', (e) => {
      this.logError(e.message || String(e.error))
    })
    
    window.addEventListener('unhandledrejection', (e) => {
      this.logError(e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled Promise Rejection')
    })
  }

  logDrillError(error: 'audio-stall' | 'cancelled', message?: string) {
    this.logError(message || `DrillResult.error: ${error}`)
  }

  /** Last message seen and when, for the synchronous half of collapsing. */
  private _lastMessage: string | null = null
  private _lastSeenAt = 0

  private logError(message: string) {
    // EVERYTHING HERE IS INSIDE try/catch ON PURPOSE.
    //
    // `DrillSession` calls this from its catch block, immediately before
    // dispatching DRILL_PHASE_EVENT — an invariant (T-021): without that
    // dispatch `isDrillPlaying` stays true and the drummer's quick menu is
    // suppressed for the rest of the session. It also calls it just before
    // `recordCompletion`, where a throw would lose the attempt.
    //
    // `persist` was already defensive; the synchronous half was not, and it
    // touches two things that can throw — `crypto.randomUUID` is undefined
    // outside a secure context, and `WebMidi` is third-party. An error
    // reporter that can break the app it reports on is worse than none.
    try {
      const now = Date.now()

      // Collapse a repeating message without touching IndexedDB at all. See
      // COLLAPSE_WINDOW_MS — under P-8 this path is taken once a second.
      if (message === this._lastMessage && now - this._lastSeenAt < COLLAPSE_WINDOW_MS) {
        this._lastSeenAt = now
        setTimeout(() => this.bumpRepeat(message, now), 0)
        return
      }
      this._lastMessage = message
      this._lastSeenAt = now

      const record: ErrorRecord = {
        id: this.newId(),
        timestamp: now,
        message,
        drillId: this.currentDrillId,
        phase: this.currentPhase,
        midiConnected: this.midiConnected(),
        count: 1,
        lastTimestamp: now,
      }

      // Fire and forget, off the hot path
      setTimeout(() => this.persist(record), 0)
    } catch {
      // Losing a log entry is acceptable. Breaking the drill is not.
    }
  }

  /** `crypto.randomUUID` needs a secure context; never let its absence throw. */
  private newId(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
    } catch {
      // fall through
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  private midiConnected(): boolean {
    try {
      return WebMidi.supported && WebMidi.inputs.length > 0
    } catch {
      return false
    }
  }

  /** Increment the stored repeat count instead of writing a duplicate row. */
  private async bumpRepeat(message: string, at: number): Promise<void> {
    try {
      const logs = await db.getAll<ErrorRecord>(STORE_ERRORS)
      const existing = logs
        .filter((l) => l.message === message)
        .sort((a, b) => b.timestamp - a.timestamp)[0]
      if (!existing) return
      existing.count = (existing.count ?? 1) + 1
      existing.lastTimestamp = at
      await db.put(STORE_ERRORS, existing.id, existing)
    } catch {
      // Same contract as persist: never surface.
    }
  }

  private async persist(record: ErrorRecord) {
    try {
      const logs = await db.getAll<ErrorRecord>(STORE_ERRORS)
      logs.push(record)
      logs.sort((a, b) => b.timestamp - a.timestamp) // newest first
      
      if (logs.length > MAX_LOGS) {
        // clear old ones
        const toDelete = logs.slice(MAX_LOGS)
        for (const item of toDelete) {
          await db.delete(STORE_ERRORS, item.id)
        }
      }
      await db.put(STORE_ERRORS, record.id, record)
    } catch (e) {
      // Intentionally swallow errors to avoid recursive logging or crashing the app
    }
  }

  async getLogs(): Promise<ErrorRecord[]> {
    const logs = await db.getAll<ErrorRecord>(STORE_ERRORS)
    logs.sort((a, b) => b.timestamp - a.timestamp)
    return logs
  }
  
  async clearLogs(): Promise<void> {
    await db.clear(STORE_ERRORS)
  }
}

export const errorReporter = new ErrorReporter()
