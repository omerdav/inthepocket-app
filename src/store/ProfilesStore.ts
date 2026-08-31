import { STORE_PROFILES, type KeyValueStore } from './db'
import type { DynamicsCalibration } from '../data/dynamicsCalibration'
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
  /**
   * Which continuous controller this kit's pedal sends (register P-15).
   *
   * Optional so profiles stored before this existed still load; absent means
   * the conventional CC#4. The range was always calibrated per kit — the
   * controller number simply never joined it, which left the pedal inert on
   * any module that does not follow the convention.
   */
  cc?: number
  calibratedAt: number
}

export interface KitProfileRecord {
  hiHat: HiHatCalibrationRecord | null
  /**
   * This drummer's velocity thresholds on this kit (7.2). Null means the
   * built-in defaults, which are one module's factory curve.
   */
  dynamics: DynamicsCalibration | null
  /** Per-zone MIDI note overrides. Null means "use the built-in defaults". A specific zone set to null means it's absent. */
  noteMap: Partial<Record<DrumType, number | null>> | null
  updatedAt: number
}

const PROFILE_KEY = 'active-kit'

export function emptyProfile(): KitProfileRecord {
  return { hiHat: null, dynamics: null, noteMap: null, updatedAt: 0 }
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

  /**
   * Options rather than positional arguments.
   *
   * `cc` was briefly a third positional parameter, which silently turned an
   * existing `saveHiHatCalibration(min, max, now)` call into one that stored a
   * timestamp as the controller number. Naming them makes that impossible.
   */
  async saveHiHatCalibration(
    min: number,
    max: number,
    opts: { cc?: number; now?: number } = {}
  ): Promise<void> {
    const profile = await this.load()
    await this.save({
      ...profile,
      hiHat: { min, max, cc: opts.cc, calibratedAt: opts.now ?? Date.now() },
    })
  }

  async saveDynamicsCalibration(calibration: DynamicsCalibration): Promise<void> {
    const profile = await this.load()
    await this.save({ ...profile, dynamics: calibration })
  }

  async dynamicsCalibration(): Promise<DynamicsCalibration | null> {
    return (await this.load()).dynamics
  }

  async hiHatCalibration(): Promise<HiHatCalibrationRecord | null> {
    return (await this.load()).hiHat
  }

  async clear(): Promise<void> {
    await this._db.clear(STORE_PROFILES)
  }
}
