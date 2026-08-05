import { STORE_PROFILES, type KeyValueStore } from './db'
import type { DrumType } from '../data/types'

/**
 * Per-drummer hardware configuration.
 *
 * The hi-hat calibration is already collected by `HiHatCalibration.tsx` and
 * then thrown away, so every reload asks the drummer to recalibrate. That is
 * the immediate reason this store exists.
 *
 * `noteMap` is the seam for M7 kit mapping: `MIDI_NOTE` is currently a single
 * hardcoded constant written against the Alesis Nitro Pro, so a Roland closed
 * hi-hat (note 22) or a Yamaha cross-stick (note 37) simply does not register.
 * Nothing writes it yet.
 */

export interface HiHatCalibrationRecord {
  /** Raw CC value at fully open. */
  min: number
  /** Raw CC value at fully closed. May be lower than min on inverted kits. */
  max: number
  calibratedAt: number
}

export interface KitProfileRecord {
  hiHat: HiHatCalibrationRecord | null
  /** Per-zone MIDI note overrides. Null means "use the built-in defaults". A specific zone set to null means it's absent. */
  noteMap: Partial<Record<DrumType, number | null>> | null
  updatedAt: number
}

const PROFILE_KEY = 'active-kit'

export function emptyProfile(): KitProfileRecord {
  return { hiHat: null, noteMap: null, updatedAt: 0 }
}

export class ProfilesStore {
  private _db: KeyValueStore

  constructor(db: KeyValueStore) {
    this._db = db
  }

  async load(): Promise<KitProfileRecord> {
    const stored = await this._db.get<KitProfileRecord>(STORE_PROFILES, PROFILE_KEY)
    return stored ? { ...emptyProfile(), ...stored } : emptyProfile()
  }

  async save(profile: KitProfileRecord): Promise<void> {
    await this._db.put(STORE_PROFILES, PROFILE_KEY, { ...profile, updatedAt: Date.now() })
  }

  async saveHiHatCalibration(min: number, max: number, now = Date.now()): Promise<void> {
    const profile = await this.load()
    await this.save({ ...profile, hiHat: { min, max, calibratedAt: now } })
  }

  async hiHatCalibration(): Promise<HiHatCalibrationRecord | null> {
    return (await this.load()).hiHat
  }

  async clear(): Promise<void> {
    await this._db.clear(STORE_PROFILES)
  }
}
