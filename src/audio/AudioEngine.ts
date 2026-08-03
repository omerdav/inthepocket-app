import workletUrl from './metronome.worklet.ts?worker&url'
import { TimestampCorrelator } from './TimestampCorrelator'
import { createMetronomeSab, SAB_RUNNING } from './metronomeSab'

/**
 * Owns the AudioContext, the metronome worklet, and the timing SharedArrayBuffer.
 *
 * Nothing else in the app should construct an AudioContext. This is the single
 * place where the audio clock — which every timing measurement is relative to —
 * comes into existence.
 *
 * ## Activation
 *
 * Browsers require a user-activation gesture (pointer / keyboard / touch) before
 * an AudioContext may run. A MIDI `noteon` is NOT such a gesture, so
 * `init()` must be called from a real interaction handler. See
 * `spike/audio-activation.html`.
 *
 * `init()` reports whether audio actually started rather than assuming it did,
 * so callers can surface an honest "tap to enable sound" state instead of
 * silently running a metronome nobody can hear.
 */
export class AudioEngine {
  private _ctx: AudioContext | null = null
  private _node: AudioWorkletNode | null = null
  private _correlator: TimestampCorrelator | null = null
  private _sab: SharedArrayBuffer | null = null
  private _view: BigInt64Array | null = null
  private _initPromise: Promise<boolean> | null = null

  /** The audio clock. Null until init() succeeds. */
  get context(): AudioContext | null {
    return this._ctx
  }

  get correlator(): TimestampCorrelator | null {
    return this._correlator
  }

  get sab(): SharedArrayBuffer | null {
    return this._sab
  }

  get view(): BigInt64Array | null {
    return this._view
  }

  /** True once the context is running — i.e. sound can actually be produced. */
  get isUnlocked(): boolean {
    return this._ctx?.state === 'running'
  }

  /** True while the metronome is emitting beats. */
  get isPlaying(): boolean {
    return this._view !== null && Atomics.load(this._view, SAB_RUNNING) === 1n
  }

  /**
   * Create the context, load the worklet, and attempt to start audio.
   *
   * **Call this from a user gesture handler.** Idempotent and concurrency-safe:
   * repeated calls share one in-flight initialisation.
   *
   * @returns whether the context reached `running`.
   */
  init(): Promise<boolean> {
    if (this._initPromise) return this._initPromise
    this._initPromise = this._doInit().catch((err) => {
      // Allow a later gesture to retry rather than wedging permanently.
      this._initPromise = null
      throw err
    })
    return this._initPromise
  }

  private async _doInit(): Promise<boolean> {
    if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
      throw new Error(
        'Not cross-origin isolated: SharedArrayBuffer is unavailable, so the ' +
          'timing bridge cannot be created. Check the COOP/COEP response headers.'
      )
    }

    const ctx = new AudioContext({ latencyHint: 'interactive' })
    this._ctx = ctx

    await ctx.audioWorklet.addModule(workletUrl)

    this._sab = createMetronomeSab()
    this._view = new BigInt64Array(this._sab)

    this._node = new AudioWorkletNode(ctx, 'metronome-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { sab: this._sab },
    })
    this._node.connect(ctx.destination)

    this._correlator = new TimestampCorrelator(ctx)

    // resume() resolves even when the autoplay policy blocks it; `state` is the
    // ground truth, so report that rather than the promise resolving.
    // (The casts defeat TS narrowing — it cannot see that resume() mutates state.)
    if ((ctx.state as AudioContextState) !== 'running') {
      try {
        await ctx.resume()
      } catch {
        /* fall through — state check below is authoritative */
      }
    }

    return (ctx.state as AudioContextState) === 'running'
  }

  /**
   * Retry unlocking after a failed init. Call from a user gesture.
   * Cheap to call when already unlocked.
   */
  async unlock(): Promise<boolean> {
    const ctx = this._ctx
    if (!ctx) return this.init()
    if ((ctx.state as AudioContextState) === 'running') return true
    try {
      await ctx.resume()
    } catch {
      /* state check below is authoritative */
    }
    const running = (ctx.state as AudioContextState) === 'running'
    if (running) this._correlator?.recalibrate()
    return running
  }

  /** Start the click. `startDelaySec` places the first beat safely in the future. */
  start(bpm: number, beatsPerBar = 4, startDelaySec = 0.1): void {
    this._requireNode().port.postMessage({ type: 'start', bpm, beatsPerBar, startDelaySec })
  }

  stop(): void {
    this._node?.port.postMessage({ type: 'stop' })
  }

  /** Change tempo without retiming the beat already scheduled. */
  setBpm(bpm: number): void {
    this._node?.port.postMessage({ type: 'setBpm', bpm })
  }

  private _requireNode(): AudioWorkletNode {
    if (!this._node) {
      throw new Error('AudioEngine.init() must complete before starting the metronome.')
    }
    return this._node
  }

  async dispose(): Promise<void> {
    this.stop()
    this._node?.disconnect()
    this._node = null
    this._correlator?.dispose()
    this._correlator = null
    if (this._ctx) {
      await this._ctx.close().catch(() => {})
      this._ctx = null
    }
    this._sab = null
    this._view = null
    this._initPromise = null
  }
}

/** Singleton — there is exactly one audio clock. */
export const audioEngine = new AudioEngine()
