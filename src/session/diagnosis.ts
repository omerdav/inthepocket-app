import type { ContentUnit } from '../data/types'
import { DiagnosticRuleId, SCORING_CATEGORIES } from '../workers/scoring.types'

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
  numResults: number
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

  if (topRule && RULE_TEXT[topRule]) {
    const others = byRule.size - 1
    return {
      headline: RULE_TEXT[topRule](phraseBeats(topBeats)),
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
