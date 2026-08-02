// src/audio/TimestampCorrelator.ts

export class TimestampCorrelator {
  private _offset = 0
  private _a = 1
  private _b = 0
  private _audioContext: AudioContext

  constructor(audioContext: AudioContext) {
    this._audioContext = audioContext
    if (typeof this._audioContext.getOutputTimestamp !== 'function') {
      throw new Error("Fatal: getOutputTimestamp() is unsupported in the current browser context.")
    }
    this.recalibrate()
    setInterval(() => this._sampleTimestamp(), 1000)
  }

  public recalibrate(): void {
    const ts = this._audioContext.getOutputTimestamp()
    if (ts.contextTime === undefined || ts.performanceTime === undefined) {
      throw new Error("Fatal: Incomplete timestamp data from getOutputTimestamp()")
    }
    this._offset = ts.contextTime - (ts.performanceTime / 1000)
    this._a = 1 / 1000
    this._b = this._offset
  }

  private _sampleTimestamp(): void {
    const ts = this._audioContext.getOutputTimestamp()
    if (ts.contextTime === undefined || ts.performanceTime === undefined) return
    
    const newOffset = ts.contextTime - (ts.performanceTime / 1000)
    const diff = Math.abs(newOffset - this._offset)
    
    if (diff > 0.005) {
      // Deviates by > 5ms (0.005s) - system sleep or device change
      this.recalibrate()
    } else {
      // EMA: offset = offset * 0.98 + newMeasurement * 0.02
      this._offset = this._offset * 0.98 + newOffset * 0.02
      this._b = this._offset
    }
  }

  /**
   * Translates incoming WebMIDI `performance.now()` hits into exact `audioContext` target times.
   */
  public mapHitTime(performanceTimeMs: number): number {
    return this._a * performanceTimeMs + this._b
  }
}
