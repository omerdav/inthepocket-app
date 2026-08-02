// src/audio/MetronomeProcessor.ts

export class MetronomeProcessor extends AudioWorkletProcessor {
  private _sab: BigInt64Array | null = null
  private _nextBeatTime: number = 0
  
  constructor(options: AudioWorkletNodeOptions) {
    super()
    if (options.processorOptions && options.processorOptions.sab) {
      this._sab = new BigInt64Array(options.processorOptions.sab)
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const currentTime = globalThis.currentTime // AudioWorklet global time in seconds
    
    // Maintain metronome scheduling logic here.
    // For demonstration, simulating a static schedule. 
    // The actual scheduling logic to calculate the future beat time would go here.
    if (this._nextBeatTime <= currentTime) {
      this._nextBeatTime = currentTime + 0.5 // example: 120 BPM
    }

    // Write the exact future timestamp of the next beat into the SharedArrayBuffer
    if (this._sab) {
      Atomics.store(this._sab, 0, BigInt(Math.round(this._nextBeatTime * 1000000)))
    }

    return true
  }
}

registerProcessor('MetronomeProcessor', MetronomeProcessor)
