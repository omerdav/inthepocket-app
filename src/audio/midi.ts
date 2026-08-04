/**
 * MidiEngine — Zero-latency WebMIDI abstraction for InThePocket.
 *
 * Design principles:
 * - NO `new` in the hot-path hit handler. All hit event objects are
 *   pre-allocated in a fixed-size pool during init().
 * - NO dynamic array operations (push, splice, spread) during the hit loop.
 *   Recent timestamps are stored in a pre-allocated Float64Array ring buffer.
 * - Timing uses `performance.now()` / Web MIDI timestamps, never `Date.now()`.
 * - 10 ms crosstalk filter between snare head (38) and snare rim (40).
 * - 80 ms debounce for UI navigation rim-click triggers.
 * - Active dead-zones: while a drill is running, all UI-navigation rim
 *   triggers are suppressed unless a "Stop" trigger fires.
 *
 * @module audio/midi
 */

import { WebMidi, type Input, type NoteMessageEvent, type ControlChangeMessageEvent } from 'webmidi'
import type { TimestampCorrelator } from './TimestampCorrelator'
import { HiHatStateTracker } from './HiHatStateTracker'
import { nearestBeatDeltaMs } from './metronomeSab'

// ---------------------------------------------------------------------------
// MIDI Note constants
// ---------------------------------------------------------------------------

/** MIDI note numbers for the standard e-drum kit mapping. */
export const MIDI_NOTE = {
  SNARE_HEAD: 38,
  SNARE_RIM: 40,
  KICK: 36,
  HI_HAT_CLOSED: 42,
  HI_HAT_CHICK: 44,
  HI_HAT_OPEN: 46,
  CRASH: 49,
  RIDE: 51,
} as const

export type MidiNoteNumber = (typeof MIDI_NOTE)[keyof typeof MIDI_NOTE]

// ---------------------------------------------------------------------------
// Hit event types
// ---------------------------------------------------------------------------

/**
 * A single MIDI drum hit.
 * Objects of this shape are **pre-allocated** and recycled via an object pool;
 * consumers must NOT hold long-lived references to them.
 */
export interface HitEvent {
  /** MIDI note number (see {@link MIDI_NOTE}). */
  note: number
  /** 0-127 MIDI velocity. */
  velocity: number
  /** High-resolution timestamp (ms) from `performance.now()`. */
  timestamp: number
  /** Monotonically increasing sequence id (wraps at pool size). */
  seq: number
  /**
   * `true` only when this hit is a snare-rim click (note 40) that passed
   * BOTH the 80 ms UI debounce AND the active-drill dead-zone check.
   * UI layers should use this flag to gate navigation actions (pause,
   * menu toggle, etc.). Always `false` for non-rim notes.
   */
  uiNavigationAllowed: boolean
  /** Exact time offset in ms compared to the metronome target beat. */
  deltaMs: number
}

/** Callback type for hit event subscribers. */
export type HitCallback = (hit: HitEvent) => void

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Max number of simultaneous hit-event objects in the pool. */
const HIT_POOL_SIZE = 64

/** Ring buffer capacity for recent timestamps (per-note). */
const RING_BUFFER_SIZE = 64

/**
 * If a snare-head (38) and snare-rim (40) arrive within this window,
 * the rim click is discarded as crosstalk.
 */
const CROSSTALK_WINDOW_MS = 10

/**
 * Minimum interval between successive rim-click events that are forwarded
 * to the UI-navigation layer (double-tap pause / navigate).
 */
const UI_DEBOUNCE_MS = 80

/** Maximum number of hit-event subscribers. Pre-allocated to avoid resizing. */
const MAX_CALLBACKS = 16

// ---------------------------------------------------------------------------
// Ring buffer for per-note timestamp history
// ---------------------------------------------------------------------------

/**
 * A fixed-capacity ring buffer backed by a Float64Array.
 * Zero-allocation after construction.
 */
class TimestampRing {
  private readonly _buf: Float64Array
  private _head = 0
  private _count = 0

  constructor(capacity: number) {
    this._buf = new Float64Array(capacity)
  }

  /** Push a timestamp into the ring (overwrites oldest when full). */
  push(value: number): void {
    this._buf[this._head] = value
    this._head = (this._head + 1) % this._buf.length
    if (this._count < this._buf.length) this._count++
  }

  /** Return the most-recently pushed value, or -1 if empty. */
  latest(): number {
    if (this._count === 0) return -1
    const idx = (this._head - 1 + this._buf.length) % this._buf.length
    return this._buf[idx]
  }

  /** Reset ring to empty state. */
  reset(): void {
    this._head = 0
    this._count = 0
  }
}

// ---------------------------------------------------------------------------
// MidiEngine
// ---------------------------------------------------------------------------

/**
 * Singleton MIDI engine that manages WebMIDI input, filtering, and dispatch.
 *
 * Usage:
 * ```ts
 * import { midiEngine } from './audio/midi'
 *
 * await midiEngine.init()
 * midiEngine.onHit((hit) => {
 *   console.log(hit.note, hit.velocity, hit.timestamp)
 * })
 * midiEngine.setDrillActive(true)
 * // ...later
 * midiEngine.dispose()
 * ```
 */
export class MidiEngine {
  // -- Pre-allocated object pool --
  private _pool: HitEvent[] = []
  private _poolCursor = 0

  // -- Subscriber slots (fixed-size, no push) --
  private readonly _callbacks: (HitCallback | null)[] = new Array<HitCallback | null>(MAX_CALLBACKS).fill(null)
  private _callbackCount = 0

  // -- Per-note timestamp rings --
  private _snareHeadRing: TimestampRing | null = null
  private _snareRimRing: TimestampRing | null = null

  // -- UI debounce --
  private _lastRimUiTime = -Infinity

  // -- Dead-zone control --
  private _drillActive = false

  // -- Lifecycle --
  private _initialized = false

  // -- Bound handler ref for cleanup --
  private _boundNoteOn: ((e: NoteMessageEvent) => void) | null = null
  private _boundControlChange: ((e: ControlChangeMessageEvent) => void) | null = null

  // -- CC Tracking --
  private _cc4Value: number = 0
  /** Constructed in init(); every use is guarded by `_initialized`. */
  private _hiHatTracker!: HiHatStateTracker

  // -- Tracked inputs for cleanup --
  private _attachedInputs: Input[] = []

  // -- Sequence counter --
  private _seq = 0

  // -- Zero-latency Sync --
  private _sharedBuffer: BigInt64Array | null = null
  private _correlator: TimestampCorrelator | null = null

  /** Whether the engine has been initialized. */
  get initialized(): boolean {
    return this._initialized
  }

  /** Current hi-hat pedal value (0-127). */
  get cc4Value(): number {
    return this._cc4Value
  }

  /** True if the hi-hat pedal is pressed down past the threshold. */
  get hiHatClosed(): boolean {
    return this._cc4Value > 90
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Set the SharedArrayBuffer and TimestampCorrelator to calculate zero-latency deltaMs.
   */
  setSyncData(sab: SharedArrayBuffer, correlator: TimestampCorrelator): void {
    this._sharedBuffer = new BigInt64Array(sab)
    this._correlator = correlator
  }

  /**
   * Request MIDI access and wire up listeners on all available inputs.
   * Pre-allocates the hit-event object pool and timestamp ring buffers.
   *
   * @throws If WebMIDI is not supported or access is denied.
   */
  async init(): Promise<void> {
    if (this._initialized) return

    this._hiHatTracker = new HiHatStateTracker({
      onEvent: (eventType, velocity, timestamp) => {
        // Widen to number: the initialiser would otherwise pin the literal 44.
        let note: number = MIDI_NOTE.HI_HAT_CHICK;
        if (eventType === 'hihat-open') note = MIDI_NOTE.HI_HAT_OPEN;
        if (eventType === 'hihat-closed') note = MIDI_NOTE.HI_HAT_CLOSED;
        
        this._dispatchHit(note, velocity, timestamp);
      }
    });

    // Expose calibration hook for UI MVP
    if (typeof window !== 'undefined') {
      (window as any).calibrateHiHat = (min: number, max: number) => {
        this._hiHatTracker.calibrate(min, max);
      };
    }

    // Pre-allocate the hit event object pool (zero `new` in hot path later).
    this._pool = new Array<HitEvent>(HIT_POOL_SIZE)
    for (let i = 0; i < HIT_POOL_SIZE; i++) {
      this._pool[i] = { note: 0, velocity: 0, timestamp: 0, seq: 0, uiNavigationAllowed: false, deltaMs: 0 }
    }
    this._poolCursor = 0

    // Pre-allocate timestamp ring buffers.
    this._snareHeadRing = new TimestampRing(RING_BUFFER_SIZE)
    this._snareRimRing = new TimestampRing(RING_BUFFER_SIZE)

    // Reset UI debounce state.
    this._lastRimUiTime = -Infinity

    // Enable WebMidi (sysex not needed for drum pads).
    await WebMidi.enable()

    // Bind handler once; the same function reference is reused for cleanup.
    this._boundNoteOn = this._handleNoteOn.bind(this)
    this._boundControlChange = this._handleControlChange.bind(this)

    // Attach to all currently-connected MIDI inputs.
    for (let i = 0; i < WebMidi.inputs.length; i++) {
      const input = WebMidi.inputs[i]
      input.addListener('noteon', this._boundNoteOn)
      input.addListener('controlchange', this._boundControlChange)
      this._attachedInputs[i] = input
    }

    this._initialized = true
  }

  /**
   * Remove all listeners and release resources.
   * Safe to call multiple times.
   */
  dispose(): void {
    if (!this._initialized) return

    // Detach MIDI listeners.
    if (this._boundNoteOn) {
      for (let i = 0; i < this._attachedInputs.length; i++) {
        const input = this._attachedInputs[i]
        if (input) {
          input.removeListener('noteon', this._boundNoteOn)
          if (this._boundControlChange) {
            input.removeListener('controlchange', this._boundControlChange)
          }
        }
      }
    }
    this._attachedInputs.length = 0
    this._boundNoteOn = null
    this._boundControlChange = null

    // Clear subscriber slots.
    for (let i = 0; i < MAX_CALLBACKS; i++) {
      this._callbacks[i] = null
    }
    this._callbackCount = 0

    // Reset rings.
    this._snareHeadRing?.reset()
    this._snareRimRing?.reset()

    this._initialized = false
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Subscribe to filtered hit events.
   *
   * @param cb  Callback that receives a **pooled** {@link HitEvent}.
   *            Do NOT cache the object; read values synchronously.
   * @returns   A dispose function that removes this specific listener.
   */
  onHit(cb: HitCallback): () => void {
    // Find the first empty slot (no push / splice).
    for (let i = 0; i < MAX_CALLBACKS; i++) {
      if (this._callbacks[i] === null) {
        this._callbacks[i] = cb
        this._callbackCount++
        return () => {
          this._callbacks[i] = null
          this._callbackCount--
        }
      }
    }
    throw new Error(
      `MidiEngine: max subscribers (${MAX_CALLBACKS}) reached. ` +
        'Increase MAX_CALLBACKS or dispose unused listeners.',
    )
  }

  /**
   * Set whether a drill is currently active.
   *
   * When active, rim-click UI navigation triggers are **dead-zoned**
   * (suppressed) to prevent accidental menu interactions while playing.
   * Actual snare-rim hits are still forwarded if they pass the crosstalk
   * filter — only the *UI debounce path* is gated.
   */
  setDrillActive(active: boolean): void {
    this._drillActive = active
    // Reset debounce state when toggling so the next rim click after
    // stopping a drill is not accidentally swallowed.
    this._lastRimUiTime = -Infinity
  }

  // -----------------------------------------------------------------------
  // Fast-path MIDI handler (ZERO allocation)
  // -----------------------------------------------------------------------

  /**
   * Core control-change handler. Called directly by WebMidi.
   * Tracks CC#4 for the hi-hat pedal.
   */
  private _handleControlChange(e: ControlChangeMessageEvent): void {
    if (e.controller.number === 4) {
      // `Number(...)` because the installed @types/webmidi (v2) does not match
      // the webmidi v3 runtime, and types `value` too loosely to multiply.
      this._cc4Value = Math.round(Number(e.value ?? 0) * 127)
      this._hiHatTracker.processCC(this._cc4Value, e.timestamp ?? performance.now());
    }
  }

  /**
   * Core note-on handler. Called directly by WebMidi for every incoming
   * MIDI note-on message. This function is the performance-critical hot path.
   *
   * Guarantees:
   * - No `new` keyword.
   * - No dynamic array growth.
   * - Only typed-array / pre-allocated object access.
   */
  private _handleNoteOn(e: NoteMessageEvent): void {
    const note = e.note.number
    const velocity = e.note.attack // 0-1 float from webmidi v3
    // Prefer the raw MIDI timestamp if the browser supplies one;
    // fall back to performance.now().
    const timestamp: number = e.timestamp ?? performance.now()

    // ---- Crosstalk filter (snare head vs. rim) ----
    // NOTE: This filter is **causal** — it can only suppress a rim click
    // that arrives AFTER a head strike within the 10 ms window. If the rim
    // arrives first (before any head hit), it passes through. This is the
    // correct zero-latency tradeoff: we never add latency by "waiting to
    // see if a head hit follows"; we only retroactively recognise
    // crosstalk when the causal ordering (head → rim) makes it obvious.
    if (note === MIDI_NOTE.SNARE_RIM) {
      const lastHead = this._snareHeadRing!.latest()
      if (lastHead >= 0 && (timestamp - lastHead) < CROSSTALK_WINDOW_MS) {
        // Rim arrived within 10 ms of a head strike — discard as crosstalk.
        return
      }
      this._snareRimRing!.push(timestamp)
    } else if (note === MIDI_NOTE.SNARE_HEAD) {
      const lastRim = this._snareRimRing!.latest()
      if (lastRim >= 0 && (timestamp - lastRim) < CROSSTALK_WINDOW_MS) {
        // Head arrived within 10 ms of a rim — the rim was crosstalk.
        // The rim was already dispatched (or discarded) so we just record
        // the head timestamp; no suppression of the head itself.
      }
      this._snareHeadRing!.push(timestamp)
    }

    // ---- UI navigation debounce + dead-zone for rim clicks ----
    // Compute whether this hit qualifies as a UI navigation trigger.
    // The result is stored on the pooled HitEvent so subscribers can
    // inspect it without requiring a separate event channel.
    let uiNav = false
    if (note === MIDI_NOTE.SNARE_RIM) {
      if (this._drillActive) {
        // Active dead-zone: rim UI triggers are fully suppressed during
        // drills. The hit still reaches onHit (for scoring) but
        // uiNavigationAllowed stays false.
      } else if ((timestamp - this._lastRimUiTime) < UI_DEBOUNCE_MS) {
        // 80 ms debounce failed — too fast after the previous rim click.
      } else {
        // Passed both checks — this rim click is eligible for UI nav.
        uiNav = true
      }
      this._lastRimUiTime = timestamp
    }

    // ---- Dispatch to subscribers via pooled HitEvent ----
    this._dispatchHit(note, Math.round(velocity * 127), timestamp, uiNav);
  }

  private _dispatchHit(note: number, velocity: number, timestamp: number, uiNav: boolean = false): void {
    const hit = this._pool[this._poolCursor]
    hit.note = note
    hit.velocity = velocity 
    hit.timestamp = timestamp
    hit.seq = this._seq
    hit.uiNavigationAllowed = uiNav

    if (this._sharedBuffer && this._correlator) {
      // Fold to the NEAREST beat, not the next one. Differencing against the
      // next beat alone reports a hit landing just after a beat as almost a
      // full period early — inverting the feedback precisely when the drummer
      // is closest to correct.
      const hitAudioTime = this._correlator.mapHitTime(timestamp)
      hit.deltaMs = nearestBeatDeltaMs(this._sharedBuffer, hitAudioTime)
    } else {
      hit.deltaMs = 0
    }

    this._seq = (this._seq + 1) | 0 // wrapping increment, no allocation

    // Advance pool cursor (wraps around).
    this._poolCursor = (this._poolCursor + 1) % HIT_POOL_SIZE

    // Notify subscribers (fixed-size loop, no iterator).
    for (let i = 0; i < MAX_CALLBACKS; i++) {
      const cb = this._callbacks[i]
      if (cb !== null) cb(hit)
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** Pre-instantiated singleton. Import and call `midiEngine.init()`. */
export const midiEngine = new MidiEngine()
