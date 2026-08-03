/**
 * Shared memory layout for the metronome timing bridge.
 *
 * The AudioWorklet writes; the main thread and MidiEngine read. All values are
 * BigInt nanoseconds on the AudioContext clock, so a hit timestamp translated
 * by the TimestampCorrelator can be compared directly against them.
 *
 * Nanoseconds (rather than the previous microseconds) because BigInt64 has the
 * headroom and it removes a units question at every read site.
 */

/** Absolute AudioContext time of the next scheduled beat, in ns. */
export const SAB_NEXT_BEAT_NS = 0
/** Beat period in ns. Zero when the metronome is stopped. */
export const SAB_PERIOD_NS = 1
/** Index of the beat referenced by SAB_NEXT_BEAT_NS, counting from start(). */
export const SAB_NEXT_BEAT_INDEX = 2
/** 1 while the metronome is running, 0 otherwise. */
export const SAB_RUNNING = 3

/** Number of BigInt64 slots the metronome SAB requires. */
export const SAB_SLOTS = 4

export const NS_PER_SEC = 1_000_000_000

/** Allocate a correctly sized SharedArrayBuffer for the metronome bridge. */
export function createMetronomeSab(): SharedArrayBuffer {
  return new SharedArrayBuffer(SAB_SLOTS * BigInt64Array.BYTES_PER_ELEMENT)
}

/**
 * Signed offset in milliseconds from `hitTimeSec` to the *nearest* beat.
 *
 * Negative = early (ahead of the beat), positive = late (behind it).
 *
 * This folds to the nearest beat rather than differencing against the next one.
 * Differencing against `nextBeat` alone reports a hit landing 5ms after a beat
 * as nearly a full period early, which inverts the feedback exactly when a
 * drummer is closest to correct.
 *
 * Returns 0 when the metronome is stopped (period 0).
 */
export function nearestBeatDeltaMs(
  view: BigInt64Array,
  hitTimeSec: number
): number {
  const periodNs = Number(Atomics.load(view, SAB_PERIOD_NS))
  if (periodNs <= 0) return 0

  const nextBeatSec = Number(Atomics.load(view, SAB_NEXT_BEAT_NS)) / NS_PER_SEC
  const periodSec = periodNs / NS_PER_SEC

  const k = Math.round((hitTimeSec - nextBeatSec) / periodSec)
  const nearestBeatSec = nextBeatSec + k * periodSec

  return (hitTimeSec - nearestBeatSec) * 1000
}
