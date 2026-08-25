import { useEffect, useState } from 'preact/hooks'
import { midiEngine } from '../../audio/midi'
import { errorReporter } from '../../ErrorReporter'

/**
 * Tells the drummer when a pad arrived that this kit has never been mapped
 * (Release_Plan 7.3 R4, register P-3).
 *
 * WHY THIS EXISTS AT ALL: before per-kit mapping, an unrecognised pad did
 * nothing — no error, no message, nothing on screen. A Roland closed hi-hat
 * was indistinguishable from an unplugged cable, a dead trigger, or a broken
 * app. That ambiguity is most of the support burden this feature prevents, and
 * mapping the pads without saying when one is unmapped would leave it intact.
 *
 * It names the note number because that is the one piece of information that
 * makes the problem actionable, and it names where to fix it.
 */

/** How long the hint stays up. Long enough to read from 1.5-2.5m, not sticky. */
const VISIBLE_MS = 6000

export function UnrecognisedPadHint() {
  const [note, setNote] = useState<number | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = midiEngine.onUnrecognisedNote((incoming) => {
      setNote(incoming)
      // Also record it, so a drummer who reports "my hi-hat does nothing" has
      // the note number in the engine log rather than having to catch the
      // banner (T-033).
      errorReporter.logUnrecognisedPad(incoming)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setNote(null), VISIBLE_MS)
    })

    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (note === null) return null

  return (
    <div class="unrecognised-pad-hint" data-testid="unrecognised-pad" data-note={String(note)}>
      <strong>Unrecognised pad</strong>
      <span>
        {' '}
        — note {note}. Open Settings and choose <strong>Map My Kit</strong> to teach the app.
      </span>
    </div>
  )
}
