/**
 * MetronomeProcessor — the timing heart of InThePocket.
 *
 * Runs on the audio render thread. Two jobs:
 *   1. Synthesise the click, sample-accurately.
 *   2. Publish the beat grid to a SharedArrayBuffer so MidiEngine can score
 *      hits against the audio clock rather than `performance.now()`.
 *
 * Lookahead: because we generate samples directly, beats are placed at exact
 * sample offsets inside the render quantum — there is no setTimeout jitter to
 * absorb. The lookahead the architecture calls for is served by publishing the
 * *next* beat's absolute time ahead of it arriving, so readers always have a
 * future reference point rather than a stale past one.
 *
 * This file is loaded via `addModule()` into AudioWorkletGlobalScope. It runs
 * in a separate global with no DOM, no window, and its own module graph.
 */

import {
  SAB_NEXT_BEAT_NS,
  SAB_PERIOD_NS,
  SAB_NEXT_BEAT_INDEX,
  SAB_RUNNING,
  NS_PER_SEC,
} from './metronomeSab'

// --- AudioWorkletGlobalScope globals ---------------------------------------
// Not available via tsconfig "types" (which is ["vite/client"]), so declared
// here. All erasable — nothing below emits runtime code.
declare const sampleRate: number
declare const currentTime: number
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
}
declare function registerProcessor(
  name: string,
  ctor: new (options?: never) => AudioWorkletProcessor
): void

// --- Click voice -----------------------------------------------------------

/** Accent (downbeat) click pitch, Hz. */
const ACCENT_HZ = 1600
/** Regular click pitch, Hz. */
const REGULAR_HZ = 1000
/** Exponential decay time constant, seconds. Short = tight, percussive. */
const DECAY_TAU = 0.012
/** Envelope is cut once it falls below this, to stop burning cycles. */
const ENV_FLOOR = 1e-4
const ACCENT_GAIN = 0.5
const REGULAR_GAIN = 0.32

const TWO_PI = Math.PI * 2

type StartMessage = {
  type: 'start'
  bpm: number
  beatsPerBar: number
  startDelaySec?: number
}

interface MetronomeOptions {
  processorOptions?: {
    sab?: SharedArrayBuffer
    /**
     * Begin immediately on construction instead of waiting for a `start`
     * message. Port messages are delivered asynchronously, so an offline
     * render started right after postMessage would drop the first beats;
     * this makes deterministic rendering (and therefore testing) possible.
     */
    autoStart?: Omit<StartMessage, 'type'>
  }
}

type ControlMessage =
  | StartMessage
  | { type: 'stop' }
  | { type: 'setBpm'; bpm: number }

class MetronomeProcessor extends AudioWorkletProcessor {
  private _view: BigInt64Array | null = null

  private _running = false
  private _periodSec = 0.5
  private _beatsPerBar = 4

  /** Absolute context time of the next beat to fire. */
  private _nextBeatSec = 0
  /** Index of that beat, counting from start(). */
  private _nextBeatIndex = 0

  // Click envelope state, carried across render quanta.
  private _envPos = -1 // seconds into the current click; <0 means silent
  private _envFreq = REGULAR_HZ
  private _envGain = REGULAR_GAIN

  constructor(options?: MetronomeOptions) {
    super(options)

    const sab = options?.processorOptions?.sab
    if (sab) this._view = new BigInt64Array(sab)

    this.port.onmessage = (e: MessageEvent<ControlMessage>) => this._onControl(e.data)

    const auto = options?.processorOptions?.autoStart
    if (auto) this._onControl({ type: 'start', ...auto })
    else this._publish()
  }

  private _onControl(msg: ControlMessage): void {
    switch (msg.type) {
      case 'start': {
        this._periodSec = 60 / msg.bpm
        this._beatsPerBar = Math.max(1, msg.beatsPerBar | 0)
        // Land the first beat slightly ahead so it is never scheduled into the
        // past on a quantum boundary.
        this._nextBeatSec = currentTime + (msg.startDelaySec ?? 0.1)
        this._nextBeatIndex = 0
        this._running = true
        break
      }
      case 'stop': {
        this._running = false
        this._envPos = -1
        break
      }
      case 'setBpm': {
        const next = 60 / msg.bpm
        // Preserve the pending beat; only subsequent spacing changes. Retiming
        // the pending beat would audibly lurch on a tempo ramp.
        this._periodSec = next
        break
      }
    }
    this._publish()
  }

  /** Write the current beat grid to shared memory. */
  private _publish(): void {
    const v = this._view
    if (!v) return
    Atomics.store(v, SAB_NEXT_BEAT_NS, BigInt(Math.round(this._nextBeatSec * NS_PER_SEC)))
    Atomics.store(v, SAB_PERIOD_NS, BigInt(this._running ? Math.round(this._periodSec * NS_PER_SEC) : 0))
    Atomics.store(v, SAB_NEXT_BEAT_INDEX, BigInt(this._nextBeatIndex))
    Atomics.store(v, SAB_RUNNING, BigInt(this._running ? 1 : 0))
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]
    if (!out || out.length === 0) return true

    const ch0 = out[0]
    const frames = ch0.length
    const invRate = 1 / sampleRate
    let advanced = false

    for (let i = 0; i < frames; i++) {
      const t = currentTime + i * invRate

      // Fire any beat whose time has arrived within this quantum.
      if (this._running && t >= this._nextBeatSec) {
        const isAccent = this._nextBeatIndex % this._beatsPerBar === 0
        this._envPos = 0
        this._envFreq = isAccent ? ACCENT_HZ : REGULAR_HZ
        this._envGain = isAccent ? ACCENT_GAIN : REGULAR_GAIN

        this._nextBeatSec += this._periodSec
        this._nextBeatIndex++
        advanced = true
      }

      let sample = 0
      if (this._envPos >= 0) {
        const env = Math.exp(-this._envPos / DECAY_TAU)
        if (env < ENV_FLOOR) {
          this._envPos = -1
        } else {
          sample = this._envGain * env * Math.sin(TWO_PI * this._envFreq * this._envPos)
          this._envPos += invRate
        }
      }

      ch0[i] = sample
    }

    // Mirror to any remaining channels.
    for (let c = 1; c < out.length; c++) out[c].set(ch0)

    if (advanced) this._publish()

    return true
  }
}

registerProcessor('metronome-processor', MetronomeProcessor)
