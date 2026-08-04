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
 * ## Activation: prepare early, unlock on a gesture
 *
 * Browsers require a user-activation gesture (pointer / keyboard / touch)
 * before an AudioContext may run, and that requirement resets on every page
 * load. A MIDI `noteon` is not such a gesture.
 *
 * So the work is split:
 *
 *   - `prepare()` does everything expensive — construct the context (which
 *     starts suspended), compile and load the worklet, allocate the SAB, build
 *     the correlator. Safe to call at boot, no gesture needed.
 *   - `unlock()` does the single operation the browser actually gates:
 *     `resume()`. Call it from a real interaction handler.
 *
 * Because the heavy work is already done, the gesture produces sound
 * immediately rather than kicking off a multi-second compile.
 *
 * Neither method assumes success. `unlock()` reports whether the context truly
 * reached `running`, so the UI can ask for another tap instead of silently
 * running a metronome nobody can hear.
 *
 * ## Why there is no browser-detection branch
 *
 * An installed PWA — and a site with enough Chrome media-engagement history —
 * is granted autoplay, so the context reaches `running` during `prepare()`
 * with no gesture at all. That is detected at runtime by reading `state`,
 * never by sniffing the browser. One code path covers every case and cannot
 * go stale when a browser changes its policy.
 */
export class AudioEngine {
  private _ctx: AudioContext | null = null
  private _node: AudioWorkletNode | null = null
  private _correlator: TimestampCorrelator | null = null
  private _sab: SharedArrayBuffer | null = null
  private _view: BigInt64Array | null = null
  private _initPromise: Promise<void> | null = null

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

  /** True once the context and worklet exist, whether or not audio is running. */
  get isPrepared(): boolean {
    return this._node !== null
  }

  /**
   * Build everything that does not require a gesture: context, worklet, SAB,
   * correlator. Call at boot so the later tap has nothing left to wait for.
   *
   * Idempotent and concurrency-safe — repeated calls share one in-flight
   * initialisation.
   */
  prepare(): Promise<void> {
    if (this._initPromise) return this._initPromise
    this._initPromise = this._doPrepare().catch((err) => {
      // Allow a retry rather than wedging permanently.
      this._initPromise = null
      throw err
    })
    return this._initPromise
  }

  private async _doPrepare(): Promise<void> {
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
  }

  /**
   * Start audio. **Call from a real interaction handler.**
   *
   * Prepares first if needed, so a caller that skipped `prepare()` still
   * works — it just pays the compile cost inside the gesture.
   *
   * @returns whether the context truly reached `running`. `resume()` resolves
   * even when the autoplay policy blocks it, so `state` is the only honest
   * answer.
   */
  async unlock(): Promise<boolean> {
    await this.prepare()
    const ctx = this._ctx
    if (!ctx) return false

    // The casts defeat TS narrowing — it cannot see that resume() mutates state.
    if ((ctx.state as AudioContextState) !== 'running') {
      try {
        await ctx.resume()
      } catch {
        /* fall through — the state check below is authoritative */
      }
    }

    const running = (ctx.state as AudioContextState) === 'running'
    // The clock may have drifted while suspended.
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
