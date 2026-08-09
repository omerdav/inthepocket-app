import type { ContentUnit } from '../data/types'
import { DiagnosticRuleId, SCORING_CATEGORIES } from '../workers/scoring.types'
import { offsetStats } from '../store/TelemetryStore'
import { MIDI_NOTE_TO_DISPLAY_NAME } from '../data/zoneNames'
import { DRUM_TYPE_TO_MIDI, VELOCITY_RANGES } from '../data/utils'

/**
 * Turn raw scoring output into the sentence a teacher would say.
 *
 * Content Plan §6.7: "a practice app that says '72% accuracy' is useless. One
 * that says 'your hi-hat foot rushes on the & of 2' is a teacher." This is the
 * layer that makes that true. The DiagnosticEngine already classifies errors
 * per note; nothing had ever rendered its output.
 */

export interface DrillDiagnosis {
  /** The one sentence to show large on screen. */
  headline: string
  /** Supporting detail, may be empty. */
  detail: string
  /** Beat positions (1-based, may be fractional) where the dominant error occurred. */
  beats: number[]
}

/** Musical position of a note, as a 1-based beat number within the bar. */
function beatOf(unit: ContentUnit, targetTimeMs: number, beatsPerBar = 4): number {
  const msPerBeat = 60000 / unit.bpm
  const absBeat = targetTimeMs / msPerBeat
  return (absBeat % beatsPerBar) + 1
}

/** "beat 3" / "beats 2 and 4" / "beats 1, 2 and 3" */
function phraseBeats(beats: number[]): string {
  const fmt = (b: number) => (Number.isInteger(b) ? String(b) : b.toFixed(2).replace(/\.?0+$/, ''))
  const uniq = [...new Set(beats.map(fmt))]
  if (uniq.length === 0) return ''
  if (uniq.length === 1) return `beat ${uniq[0]}`
  if (uniq.length === 2) return `beats ${uniq[0]} and ${uniq[1]}`
  return `beats ${uniq.slice(0, -1).join(', ')} and ${uniq[uniq.length - 1]}`
}

const RULE_TEXT: Record<number, (where: string) => string> = {
  [DiagnosticRuleId.RUSHING]: (w) => `You're rushing on ${w} — landing ahead of the click.`,
  [DiagnosticRuleId.DRAGGING]: (w) => `You're dragging on ${w} — landing behind the click.`,
  [DiagnosticRuleId.GHOST_TOO_LOUD]: (w) =>
    `Your ghost notes on ${w} are too loud — they're competing with your accents.`,
  [DiagnosticRuleId.ACCENT_TOO_SOFT]: (w) => `Your accents on ${w} aren't cutting through.`,
  [DiagnosticRuleId.ZONE_CONFUSION]: (w) =>
    `On ${w} you hit the head instead of the rim — soft isn't the same as cross-stick.`,
}


export function diagnose(
  unit: ContentUnit,
  categories: Int8Array,
  diagnosticRuleIds: Uint8Array,
  offsets: Float32Array,
  numResults: number,
  struckZones?: Int8Array
): DrillDiagnosis {
  const missBeats: number[] = []
  const byRule = new Map<number, number[]>()

  for (let i = 0; i < numResults; i++) {
    const note = unit.sequence[i]
    if (!note) continue
    const beat = beatOf(unit, note.targetTimeMs)

    if (categories[i] === SCORING_CATEGORIES.MISS) {
      missBeats.push(beat)
      continue
    }
    const rule = diagnosticRuleIds[i]
    if (rule && rule !== DiagnosticRuleId.OK) {
      const list = byRule.get(rule) ?? []
      list.push(beat)
      byRule.set(rule, list)
    }
  }

  // Missed notes dominate — you cannot diagnose a note that was never played.
  if (missBeats.length > numResults / 3) {
    return {
      headline: `You missed ${missBeats.length} of ${numResults} notes.`,
      detail: 'Try the drill again — focus on playing every note before worrying about precision.',
      beats: missBeats,
    }
  }

  // Report the most frequent error class; piling on every fault at once is how
  // a beginner concludes they are bad at everything.
  let topRule = 0
  let topBeats: number[] = []
  for (const [rule, beats] of byRule) {
    if (beats.length > topBeats.length) {
      topRule = rule
      topBeats = beats
    }
  }

  // --- Variance Check ---
  const scoredOffsets: number[] = [];
  for (let i = 0; i < numResults; i++) {
    if (categories[i] !== SCORING_CATEGORIES.MISS) {
      scoredOffsets.push(offsets[i]);
    }
  }
  const { meanOffsetMs, offsetStdDevMs } = offsetStats(scoredOffsets, scoredOffsets.length);

  // Separates players with a persistent directional drift (rushing/dragging)
  // from players who are simply scattered and need to work on control.
  const INCONSISTENT_SPREAD_MS = 30;
  const INCONSISTENT_MAX_BIAS_MS = 20;

  const isDirectionalRule = topRule === DiagnosticRuleId.RUSHING || topRule === DiagnosticRuleId.DRAGGING;
  
  // If the drummer is scattered rather than biased, a directional rule will give them the wrong advice (making variance worse).
  if (offsetStdDevMs > INCONSISTENT_SPREAD_MS && Math.abs(meanOffsetMs) < INCONSISTENT_MAX_BIAS_MS) {
    if (!topRule || isDirectionalRule) {
      return {
        headline: "You're inconsistent.",
        detail: "Your timing is scattered. Focus on evenness rather than adjusting your speed.",
        beats: []
      }
    }
  }

  // Only call these "ghost notes" if every flagged note actually is one. A drill
  // that mixes ghost and normal strokes would otherwise tell the drummer to
  // control ghost notes on beats that have none — vague and correct beats
  // specific and wrong.
  let ghostTooLoudIsGhost = false;
  if (topRule === DiagnosticRuleId.GHOST_TOO_LOUD) {
    let flagged = 0;
    let ghostBand = 0;
    for (let i = 0; i < numResults; i++) {
      if (diagnosticRuleIds[i] !== DiagnosticRuleId.GHOST_TOO_LOUD) continue;
      const note = unit.sequence[i];
      if (!note) continue;
      flagged++;
      const maxVelocity = note.velocityRange
        ? note.velocityRange.max
        : note.isAccent
          ? VELOCITY_RANGES.ACCENT.max
          : VELOCITY_RANGES.NORMAL.max;
      if (maxVelocity <= VELOCITY_RANGES.GHOST.max) ghostBand++;
    }
    ghostTooLoudIsGhost = flagged > 0 && ghostBand === flagged;
  }

  if (topRule && RULE_TEXT[topRule]) {
    const others = byRule.size - 1
    let headline = RULE_TEXT[topRule](phraseBeats(topBeats));

    if (topRule === DiagnosticRuleId.GHOST_TOO_LOUD && !ghostTooLoudIsGhost) {
      headline = `Your dynamics are uneven on ${phraseBeats(topBeats)} — you're hitting harder than the drill asks.`;
    } else if (topRule === DiagnosticRuleId.ZONE_CONFUSION) {
      // Find the specific expected and struck zones for the first confused note
      let expectedNote = -1;
      let struckNote = -1;
      
      for (let i = 0; i < numResults; i++) {
        if (diagnosticRuleIds[i] === DiagnosticRuleId.ZONE_CONFUSION) {
          expectedNote = DRUM_TYPE_TO_MIDI[unit.sequence[i]?.drumType] ?? -1;
          struckNote = struckZones?.[i] ?? -1;
          break;
        }
      }

      if (expectedNote !== -1 && struckNote !== -1) {
        // Filter topBeats to only include those matching this specific pair
        const pairBeats: number[] = [];
        for (let i = 0; i < numResults; i++) {
          if (diagnosticRuleIds[i] === DiagnosticRuleId.ZONE_CONFUSION) {
            const e = DRUM_TYPE_TO_MIDI[unit.sequence[i]?.drumType] ?? -1;
            const s = struckZones?.[i] ?? -1;
            if (e === expectedNote && s === struckNote) {
              const note = unit.sequence[i];
              if (note) pairBeats.push(beatOf(unit, note.targetTimeMs));
            }
          }
        }
        topBeats = pairBeats;

        // R4: Keep the cross-stick guidance specifically for head-instead-of-rim
        if (expectedNote === DRUM_TYPE_TO_MIDI['snare-rim'] && struckNote === DRUM_TYPE_TO_MIDI['snare-head']) {
          headline = `On ${phraseBeats(topBeats)} you hit the head instead of the rim — soft isn't the same as cross-stick.`;
        } else {
          const expectedName = MIDI_NOTE_TO_DISPLAY_NAME[expectedNote];
          const struckName = MIDI_NOTE_TO_DISPLAY_NAME[struckNote];
          
          if (expectedName && struckName) {
            headline = `On ${phraseBeats(topBeats)} you hit ${struckName} instead of ${expectedName}.`;
          } else {
            // R6: Fall back to something true and general
            headline = `On ${phraseBeats(topBeats)} you hit the wrong drum zone.`;
          }
        }
      } else {
        // Fallback if data is missing
        headline = `On ${phraseBeats(topBeats)} you hit the wrong drum zone.`;
      }
    }

    return {
      headline,
      detail: others > 0 ? `${others} other issue${others > 1 ? 's' : ''} to work on next.` : '',
      beats: topBeats,
    }
  }

  if (missBeats.length > 0) {
    return {
      headline: `Missed ${phraseBeats(missBeats)}.`,
      detail: 'Everything else was in the pocket.',
      beats: missBeats,
    }
  }

  // Nothing classified — fall back to describing the timing spread honestly.
  let sum = 0
  let n = 0
  for (let i = 0; i < numResults; i++) {
    if (categories[i] !== SCORING_CATEGORIES.MISS) {
      sum += offsets[i]
      n++
    }
  }
  const mean = n ? sum / n : 0
  if (Math.abs(mean) > 8) {
    return {
      headline:
        mean < 0
          ? `You're consistently ${Math.abs(mean).toFixed(0)}ms ahead of the click.`
          : `You're consistently ${mean.toFixed(0)}ms behind the click.`,
      detail: 'That is a habit, not an accident — worth correcting deliberately.',
      beats: [],
    }
  }

  return { headline: 'In the pocket.', detail: '', beats: [] }
}
