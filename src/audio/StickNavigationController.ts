import { type MidiEngine, type HitEvent } from './midi'

export interface StickNavMapping {
  /** MIDI note numbers that trigger this action */
  notes: readonly number[]
  /** Optional modifier requirements */
  modifier?: {
    /** If set, requires this CC# to be above the threshold */
    cc?: number
    ccThreshold?: number
    /** If set, requires N taps within this window (ms) */
    multiTapCount?: number
    multiTapWindowMs?: number
  }
}

export interface StickNavConfig {
  scrollDown: StickNavMapping
  select: StickNavMapping
  pause: StickNavMapping
}

export const DEFAULT_STICK_NAV_CONFIG: StickNavConfig = {
  scrollDown: {
    notes: [40],  // Snare Rim
  },
  select: {
    notes: [38, 36],  // Snare Head OR Kick
  },
  pause: {
    notes: [40],  // Snare Rim
    modifier: {
      cc: 4,
      ccThreshold: 90,
      multiTapCount: 2,
      multiTapWindowMs: 250,
    },
  },
}

export class StickNavigationController {
  private _midiEngine: MidiEngine
  private _config: StickNavConfig
  private _unsubscribe: (() => void) | null = null
  private _lastPauseQualifyingTime = -Infinity

  constructor(midiEngine: MidiEngine, config: StickNavConfig = DEFAULT_STICK_NAV_CONFIG) {
    this._midiEngine = midiEngine
    this._config = config
  }

  /** Start listening to MIDI hits and dispatching navigation events */
  enable(): void {
    if (this._unsubscribe) return
    this._unsubscribe = this._midiEngine.onHit(this._handleHit.bind(this))
  }

  /** Stop listening */
  disable(): void {
    if (this._unsubscribe) {
      this._unsubscribe()
      this._unsubscribe = null
    }
  }

  /** Update the mapping config at runtime */
  setConfig(config: StickNavConfig): void {
    this._config = config
  }

  /** Dispose and clean up */
  dispose(): void {
    this.disable()
  }

  private _handleHit(hit: HitEvent): void {
    // Respect the existing uiNavigationAllowed flag for rim clicks
    const isNavAllowed = hit.note !== 40 || hit.uiNavigationAllowed
    if (!isNavAllowed) return

    // Check Pause gesture first (modifier + double-tap)
    if (this._config.pause.notes.includes(hit.note)) {
      const modifier = this._config.pause.modifier
      if (modifier && modifier.cc === 4) {
        const threshold = modifier.ccThreshold ?? 90
        if (this._midiEngine.cc4Value > threshold) {
          const now = hit.timestamp
          const windowMs = modifier.multiTapWindowMs ?? 250
          if (now - this._lastPauseQualifyingTime <= windowMs) {
            // Double tap detected
            window.dispatchEvent(new CustomEvent('stick-pause'))
            this._lastPauseQualifyingTime = -Infinity // Reset after firing
            return // Do not fall through to trigger scroll-down on the pause trigger tap
          } else {
            this._lastPauseQualifyingTime = now
          }
        }
      }
    }

    // Check Scroll Down
    if (this._config.scrollDown.notes.includes(hit.note)) {
      window.dispatchEvent(new CustomEvent('stick-scroll-down'))
    }

    // Check Select
    if (this._config.select.notes.includes(hit.note)) {
      window.dispatchEvent(new CustomEvent('stick-select'))
    }
  }
}
