import { STORE_TELEMETRY, type KeyValueStore } from './db'

/**
 * Session history — what happened, per attempt.
 *
 * Separate from progression: this is the raw record that trends, the weekly
 * recap and Groove DNA are computed from, and it stays append-only so a
 * drummer's history is never rewritten by a later change to gating rules.
 */

export interface SessionRecord {
  id: string
  drillId: string
  startedAt: number
  passed: boolean
  accuracyPercent: number
  /** Signed mean offset: negative = ahead of the click, positive = behind. */
  meanOffsetMs: number
  /**
   * Spread of the offsets.
   *
   * Stored because mean alone cannot separate a drummer who consistently
   * rushes from one who is merely inconsistent — the distinction
   * Skill_Placement_Model §5 calls the one that matters most. Anything
   * computing "are they rushing or scattered" needs this number.
   */
  offsetStdDevMs: number
  diagnosisHeadline: string
  numTargets: number
  numHits: number
}

export interface OffsetStats {
  meanOffsetMs: number
  offsetStdDevMs: number
}

/** Mean and population standard deviation over the scored (non-missed) hits. */
export function offsetStats(offsets: ArrayLike<number>, count: number): OffsetStats {
  if (count <= 0) return { meanOffsetMs: 0, offsetStdDevMs: 0 }

  let sum = 0
  for (let i = 0; i < count; i++) sum += offsets[i]
  const mean = sum / count

  let variance = 0
  for (let i = 0; i < count; i++) {
    const d = offsets[i] - mean
    variance += d * d
  }

  return { meanOffsetMs: mean, offsetStdDevMs: Math.sqrt(variance / count) }
}

export class TelemetryStore {
  private _db: KeyValueStore

  constructor(db: KeyValueStore) {
    this._db = db
  }

  async record(record: SessionRecord): Promise<void> {
    await this._db.put(STORE_TELEMETRY, record.id, record)
  }

  /** Newest first. */
  async history(limit?: number): Promise<SessionRecord[]> {
    const all = await this._db.getAll<SessionRecord>(STORE_TELEMETRY)
    all.sort((a, b) => b.startedAt - a.startedAt)
    return limit == null ? all : all.slice(0, limit)
  }

  async forDrill(drillId: string): Promise<SessionRecord[]> {
    return (await this.history()).filter((r) => r.drillId === drillId)
  }

  async clear(): Promise<void> {
    await this._db.clear(STORE_TELEMETRY)
  }
}
