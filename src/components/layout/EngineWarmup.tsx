import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import { audioEngine } from '../../audio/AudioEngine'
import { midiEngine, type HitEvent } from '../../audio/midi'
import './EngineWarmup.css'

/**
 * First screen of a session.
 *
 * Two deliberately independent steps:
 *
 *   1. **Tap** — satisfies the browser's user-activation requirement and
 *      starts audio. Nothing to do with drums.
 *   2. **Hit the snare** — confirms the kit is connected. Nothing to do with
 *      the browser.
 *
 * The earlier design collapsed these into one ("hit your snare to connect"),
 * which made hardware detection responsible for unlocking audio. That relies
 * on browser behaviour we do not control, and fails silently when it stops
 * working: the drummer hits the pad, the app says connected, and there is no
 * click. Splitting them makes each step verifiable and gives the browser
 * exactly the gesture it asks for.
 *
 * Step 1 is skipped automatically when audio is already running — installed
 * PWAs and sites with enough Chrome media-engagement history are granted
 * autoplay. That is detected by reading the context's state, never by
 * sniffing the browser, so it stays correct as policies change.
 */

type Phase = 'loading' | 'awaiting-tap' | 'awaiting-kit' | 'kit-found' | 'retry-tap'

/** How long to wait before offering a way past kit detection. */
const NO_KIT_HINT_MS = 6000
/** Grace period for `midiEngine.init()` to resolve before we call it absent. */
const MIDI_SETTLE_MS = 1200

interface Props {
  onReady: () => void
}

export function EngineWarmup({ onReady }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [showNoKitHint, setShowNoKitHint] = useState(false)
  const doneRef = useRef(false)

  // Preload everything that does not need a gesture, so the tap has nothing
  // left to wait for and produces sound immediately.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await audioEngine.prepare()
      } catch (err) {
        console.warn('[EngineWarmup] audio preparation failed:', err)
      }
      if (cancelled) return
      // Already running? Autoplay was granted; go straight to the kit step.
      setPhase(audioEngine.isUnlocked ? 'awaiting-kit' : 'awaiting-tap')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Listen for the kit only while that step is showing.
  /**
   * useLayoutEffect, not useEffect (register P-14).
   *
   * A plain effect runs *after* paint, so this screen was visible — telling the
   * drummer to hit something — before it was listening. A strike in that window
   * went nowhere. The drummer hits, sees no response, and has no way to tell
   * whether the app, the cable or their pad is at fault.
   *
   * A layout effect runs before the browser paints, so the subscription exists
   * by the time the prompt is on screen. Nothing here touches layout, so there
   * is no cost to running it earlier.
   */
  useLayoutEffect(() => {
    if (phase !== 'awaiting-kit') return

    const unsubscribe = midiEngine.onHit((_hit: HitEvent) => {
      if (doneRef.current) return
      doneRef.current = true
      setPhase('kit-found')
      // Let the confirmation register before moving on.
      setTimeout(onReady, 700)
    })

    // If Web MIDI is unavailable or was denied, there is no point asking
    // someone to hit a pad we cannot hear. `midiEngine.init()` is async, so
    // allow it a moment to settle before concluding there is no kit.
    const midiCheck = setTimeout(() => {
      if (!midiEngine.initialized) setShowNoKitHint(true)
    }, MIDI_SETTLE_MS)

    // Otherwise offer the escape hatch only after a fair chance to hit a pad.
    const hintTimer = setTimeout(() => setShowNoKitHint(true), NO_KIT_HINT_MS)

    return () => {
      unsubscribe()
      clearTimeout(midiCheck)
      clearTimeout(hintTimer)
    }
  }, [phase])

  const handleTap = async () => {
    const unlocked = await audioEngine.unlock()
    setPhase(unlocked ? 'awaiting-kit' : 'retry-tap')
  }

  const tappable = phase === 'awaiting-tap' || phase === 'retry-tap'

  return (
    <div
      class="warmup"
      data-testid="engine-warmup"
      data-phase={phase}
      onClick={tappable ? handleTap : undefined}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onKeyDown={tappable ? (e: KeyboardEvent) => e.key === 'Enter' && void handleTap() : undefined}
    >
      <div class="warmup-inner">
        <div class="warmup-mark">🥁</div>
        <h1 class="warmup-title">In The Pocket</h1>

        {phase === 'loading' && <p class="warmup-line dim">Warming up…</p>}

        {phase === 'awaiting-tap' && (
          <p class="warmup-line huge" data-testid="warmup-tap">
            Tap anywhere to begin
          </p>
        )}

        {/* Only after a tap has failed do we admit there is a technical
            problem — and still without naming AudioContext or autoplay. */}
        {phase === 'retry-tap' && (
          <p class="warmup-line huge warn" data-testid="warmup-retry">
            Sound couldn't be started. Tap again.
          </p>
        )}

        {phase === 'awaiting-kit' && (
          <>
            <p class="warmup-line huge" data-testid="warmup-kit">
              Hit your snare once
              <span class="warmup-sub">to connect your kit</span>
            </p>
            <div class="warmup-listening" aria-hidden="true">
              <span /><span /><span />
            </div>
            {showNoKitHint && (
              <button
                class="warmup-skip"
                data-testid="warmup-skip"
                onClick={(e) => {
                  e.stopPropagation()
                  onReady()
                }}
              >
                No kit connected — continue anyway
              </button>
            )}
          </>
        )}

        {phase === 'kit-found' && (
          <p class="warmup-line huge ok" data-testid="warmup-kit-found">
            ✓ Kit detected
          </p>
        )}
      </div>
    </div>
  )
}
