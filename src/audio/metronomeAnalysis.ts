/**
 * Offline rendering + onset measurement for the metronome.
 *
 * Renders the real worklet in an OfflineAudioContext and measures where the
 * clicks actually land in the produced samples. This is the difference between
 * "the code looks right" and "the audio is right": if the processor stops
 * writing to `outputs`, or drifts, or ignores tempo, these numbers move.
 *
 * Used by the E2E suite and by the dev verification page.
 */

import workletUrl from './metronome.worklet.ts?worker&url'

export interface ClickOnset {
  /** Seconds from the start of the render. */
  timeSec: number
  /** Peak absolute amplitude of this click. */
  peak: number
}

export interface MetronomeRenderResult {
  onsets: ClickOnset[]
  /** Gaps between consecutive onsets, in ms. */
  intervalsMs: number[]
  sampleRate: number
  durationSec: number
  /** Peak amplitude across the whole render. 0 means total silence. */
  overallPeak: number
}

export interface RenderOptions {
  bpm: number
  beatsPerBar?: number
  durationSec?: number
  startDelaySec?: number
  sampleRate?: number
}

/**
 * Detect click onsets: a rising edge above `threshold` after at least
 * `minGapSec` of quiet. The clicks decay in ~40ms, so a 50ms guard cannot
 * merge two beats even at 200 BPM (300ms apart).
 */
export function findOnsets(
  samples: Float32Array,
  sampleRate: number,
  threshold = 0.02,
  minGapSec = 0.05
): ClickOnset[] {
  const onsets: ClickOnset[] = []
  const minGapSamples = Math.floor(minGapSec * sampleRate)
  let lastOnsetIdx = -Infinity
  let i = 0

  while (i < samples.length) {
    if (Math.abs(samples[i]) >= threshold && i - lastOnsetIdx > minGapSamples) {
      // Walk the decay to capture the peak.
      let peak = 0
      let j = i
      const end = Math.min(samples.length, i + minGapSamples)
      for (; j < end; j++) {
        const a = Math.abs(samples[j])
        if (a > peak) peak = a
      }
      onsets.push({ timeSec: i / sampleRate, peak })
      lastOnsetIdx = i
      i = end
      continue
    }
    i++
  }

  return onsets
}

/** Render the metronome offline and measure what it actually produced. */
export async function renderMetronome(opts: RenderOptions): Promise<MetronomeRenderResult> {
  const {
    bpm,
    beatsPerBar = 4,
    durationSec = 4,
    startDelaySec = 0.1,
    sampleRate = 48000,
  } = opts

  const ctx = new OfflineAudioContext(1, Math.ceil(durationSec * sampleRate), sampleRate)
  await ctx.audioWorklet.addModule(workletUrl)

  // Start via processorOptions, not postMessage: port delivery is async and
  // would race the render.
  const node = new AudioWorkletNode(ctx, 'metronome-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: {
      autoStart: { bpm, beatsPerBar, startDelaySec },
    },
  })
  node.connect(ctx.destination)

  const buffer = await ctx.startRendering()
  const samples = buffer.getChannelData(0)

  let overallPeak = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i])
    if (a > overallPeak) overallPeak = a
  }

  const onsets = findOnsets(samples, sampleRate)
  const intervalsMs: number[] = []
  for (let i = 1; i < onsets.length; i++) {
    intervalsMs.push((onsets[i].timeSec - onsets[i - 1].timeSec) * 1000)
  }

  return { onsets, intervalsMs, sampleRate, durationSec, overallPeak }
}
