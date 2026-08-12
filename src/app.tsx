import { useState, useEffect, useRef } from 'preact/hooks'
import { midiEngine, MIDI_NOTE, type HitEvent } from './audio/midi'
import { GrooveCircle } from './components/canvas/GrooveCircle'
import { SettingsMenu } from './components/settings/SettingsMenu'
import { isSettingsMenuOpen, isBlindModeEnabled, blindModeThreshold, hitVisualMode, stickingCuePlacement } from './state/settings'
import { StickNavigationController } from './audio/StickNavigationController'
import { ThroneView } from './components/layout/ThroneView'
import type { ScoringWorkerResultMessage } from './workers/scoring.types'
import { effect } from '@preact/signals'
import { RhythmGrid, type DrillSequence } from './components/drills/RhythmGrid'
import { DrillSession } from './components/drills/DrillSession'
import { getDrill, DEFAULT_DRILL_ID } from './data/registry'
import { currentDrillId } from './state/routing'
import { QuickMenu } from './components/layout/QuickMenu'
import { HiHatCalibration, isCalibrationOpen, restoreHiHatCalibration } from './components/layout/HiHatCalibration'
import { progressionStore } from './store'
import { EngineWarmup } from './components/layout/EngineWarmup'
import { hasCompletedDiagnostic, isQuickMenuOpen, isDrillPlaying } from './state/session'
import { useSignalEffect } from '@preact/signals'

// E2E Hooks
if (typeof window !== 'undefined') {
  if (typeof window !== 'undefined') {
    window.addEventListener('itp-set-blind-mode', ((e: CustomEvent) => {
      isBlindModeEnabled.value = e.detail.enabled;
      blindModeThreshold.value = e.detail.threshold;
    }) as EventListener);
  }
  (window as any).setHitVisualMode = (mode: 'pulse' | 'arrows') => {
    hitVisualMode.value = mode;
  };
  (window as any).setStickingCuePlacement = (placement: 'inside' | 'underneath') => {
    stickingCuePlacement.value = placement;
  };
}
import './app.css'

const PAD_MAP = [
  { note: MIDI_NOTE.KICK, name: 'Kick', key: 'A', icon: '🦶', color: '#ff0055' },
  { note: MIDI_NOTE.SNARE_HEAD, name: 'Snare Head', key: 'S', icon: '🥁', color: '#00fff5' },
  { note: MIDI_NOTE.SNARE_RIM, name: 'Snare Rim', key: 'D', icon: '🪵', color: '#ffe600' },
  { note: MIDI_NOTE.HI_HAT_CLOSED, name: 'HH Closed', key: 'F', icon: '🧢', color: '#00ff66' },
  { note: MIDI_NOTE.HI_HAT_OPEN, name: 'HH Open', key: 'G', icon: '🎩', color: '#aa00ff' },
  { note: MIDI_NOTE.CRASH, name: 'Crash', key: 'H', icon: '💥', color: '#ff9900' },
  { note: MIDI_NOTE.RIDE, name: 'Ride', key: 'J', icon: '🔔', color: '#0099ff' }
]

const IS_DEV_VIEW =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev')

const dummySequence: DrillSequence = [
  { targetTimeMs: 1000, drumType: 'kick', sticking: 'R', isAccent: true },
  { targetTimeMs: 1500, drumType: 'snare', sticking: 'L', isAccent: false }
]

export function App() {
  const [midiConnected, setMidiConnected] = useState(false)
  const [recentHits, setRecentHits] = useState<Array<{ note: number; velocity: number; time: string; uiAllowed: boolean }>>([])
  const [activePad, setActivePad] = useState<number | null>(null)
  const [scoringWorker, setScoringWorker] = useState<Worker | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [warmedUp, setWarmedUp] = useState(false)

  // Restore persisted state before the first-run overlays are allowed to
  // render, so a returning drummer is not flashed a setup prompt they already
  // completed.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let placed = false
      try {
        placed = (await progressionStore.load()).placementCompletedAt != null
        await restoreHiHatCalibration()
      } catch (err) {
        // Storage unavailable (private browsing, blocked). Fall through to the
        // first-run flow rather than blocking the app.
        console.warn('[app] could not restore saved progress:', err)
      }
      if (cancelled) return
      if (placed) hasCompletedDiagnostic.value = true
      setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const canvasRef = useRef<HTMLDivElement>(null)
  const grooveCircleRef = useRef<GrooveCircle | null>(null)

  const scoringWorkerRef = useRef<Worker | null>(null)

  useEffect(() => {
    // Mount GrooveCircle Canvas
    if (canvasRef.current && !grooveCircleRef.current) {
      const gc = new GrooveCircle({ bpm: 120, timeSignature: 4, canvasSize: 320 })
      gc.mount(canvasRef.current)
      grooveCircleRef.current = gc
    }

    const disposeEffect = effect(() => {
      if (grooveCircleRef.current) {
        if (isSettingsMenuOpen.value) {
          grooveCircleRef.current.stop()
        } else {
          grooveCircleRef.current.start()
        }
      }
    })

    // Initialize ScoringWorker
    const worker = new Worker(new URL('./workers/ScoringWorker.ts', import.meta.url), { type: 'module' })
    worker.postMessage({ type: 'init', bufferSize: 128 })
    
    worker.onmessage = (event: MessageEvent<ScoringWorkerResultMessage>) => {
      const msg = event.data;
      if (msg.type === 'result' && grooveCircleRef.current) {
        for (let i = 0; i < msg.numResults; i++) {
          grooveCircleRef.current.registerHit(msg.offsets[i], msg.categories[i]);
        }
      }
    };
    scoringWorkerRef.current = worker;
    setScoringWorker(worker);

    // Initialize MidiEngine
    midiEngine.init().then(() => {
      setMidiConnected(true)
      const navCtrl = new StickNavigationController(midiEngine)
      navCtrl.enable()
      // Store to dispose later if needed, but it's a singleton mostly for now
      ;(window as any)._stickNavCtrl = navCtrl
    }).catch(err => {
      console.warn('WebMIDI not available or permission denied:', err)
    })

    // Subscribe to MIDI hits
    const unsub = midiEngine.onHit((hit: HitEvent) => {
      setActivePad(hit.note)
      setTimeout(() => setActivePad(null), 150)

      setRecentHits(prev => [
        {
          note: hit.note,
          velocity: hit.velocity,
          time: new Date().toLocaleTimeString() + `.${(hit.timestamp % 1000).toFixed(0).padStart(3, '0')}`,
          uiAllowed: hit.uiNavigationAllowed
        },
        ...prev.slice(0, 7)
      ])
    })

    // Keyboard listener for interactive manual triggering
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase()
      const match = PAD_MAP.find(p => p.key === key)
      if (match) {
        // Trigger via Virtual Drummer window hook if present, or simulate noteOn
        if ((window as any).__virtualDrummer) {
          (window as any).__virtualDrummer.hit(match.note, 100)
        } else {
          // Direct fallback dispatch for manual clicks/keys
          (midiEngine as any)._handleNoteOn({
            note: { number: match.note, attack: 100 / 127 },
            timestamp: performance.now()
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    const handleGlobalPause = () => {
      isSettingsMenuOpen.value = !isSettingsMenuOpen.value;
    };
    window.addEventListener('stick-pause', handleGlobalPause);

    return () => {
      unsub()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('stick-pause', handleGlobalPause)
      disposeEffect()
      if (scoringWorkerRef.current) {
        scoringWorkerRef.current.terminate()
        scoringWorkerRef.current = null
      }
      if (grooveCircleRef.current) {
        grooveCircleRef.current.unmount()
        grooveCircleRef.current = null
      }
      if ((window as any)._stickNavCtrl) {
        (window as any)._stickNavCtrl.dispose()
      }
    }
  }, [])

  const triggerPad = (note: number) => {
    if ((window as any).__virtualDrummer) {
      (window as any).__virtualDrummer.hit(note, 110)
    } else {
      (midiEngine as any)._handleNoteOn({
        note: { number: note, attack: 110 / 127 },
        timestamp: performance.now()
      })
    }
  }

  const header = (
    <header class="drum-header">
      <div class="header-brand">
        <h1>🥁 IN THE POCKET</h1>
        <span class="version-tag">PRO VIRTUAL DRUMMER</span>
      </div>
      <div class={`midi-status-badge ${midiConnected ? 'connected' : 'disconnected'}`}>
        <span class="status-dot"></span>
        {midiConnected ? 'WebMIDI Active' : 'MIDI Standby'}
      </div>
    </header>
  );

  // The product screen: a real drill, resolved from the URL, played against
  // the real click. `key` forces a clean remount when the drill changes so no
  // result from the previous drill leaks into the new one.
  const activeDrill = getDrill(currentDrillId.value) ?? getDrill(DEFAULT_DRILL_ID)!;
  const mainVisual = scoringWorker
    ? <DrillSession key={activeDrill.id} unit={activeDrill} worker={scoringWorker} />
    : <section class="visualizer-card"><h2>Starting engine…</h2></section>;

  // Debug harness — emoji pads, event feed, canvas probe. Useful during engine
  // work, but the inverse of the Anti-DAW premise, so it is off the product
  // path and reachable only at ?dev=1.
  const devVisual = (
    <section class="visualizer-card">
      <h2>Groove Engine (dev)</h2>
      <div class="canvas-wrapper" ref={canvasRef}></div>
      <p class="canvas-subtext">Real-time Sub-millisecond Timing Visualizer</p>

      <div style={{ marginTop: '20px' }}>
        <RhythmGrid sequence={dummySequence} />
      </div>
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button onClick={() => isDrillPlaying.value = !isDrillPlaying.value} style={{ padding: '8px 16px', background: isDrillPlaying.value ? '#ff0055' : '#00fff5', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          {isDrillPlaying.value ? 'Stop Drill' : 'Play Drill'}
        </button>
        <button onClick={() => isQuickMenuOpen.value = !isQuickMenuOpen.value} style={{ padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Toggle Menu
        </button>
      </div>
    </section>
  );

  const sidePanel = (
    <section class="pads-card">
      <h2>Virtual Drum Kit</h2>
      <p class="pads-subtitle">Click pads or press keyboard keys (A, S, D, F, G, H, J)</p>
      <div class="pad-grid">
        {PAD_MAP.map(pad => (
          <button
            key={pad.note}
            type="button"
            class={`drum-pad ${activePad === pad.note ? 'active' : ''}`}
            style={{ '--pad-color': pad.color }}
            onClick={() => triggerPad(pad.note)}
          >
            <span class="pad-icon">{pad.icon}</span>
            <span class="pad-name">{pad.name}</span>
            <span class="pad-key">Key: {pad.key}</span>
          </button>
        ))}
      </div>
    </section>
  );

  const footer = (
    <footer class="hit-log-footer">
      <h3>Live Event Feed</h3>
      <div class="log-entries">
        {recentHits.length === 0 ? (
          <p class="log-empty">Hit a pad or play MIDI to stream hit events...</p>
        ) : (
          recentHits.map((h, i) => {
            const padInfo = PAD_MAP.find(p => p.note === h.note)
            return (
              <div key={i} class="log-entry">
                <span class="log-time">{h.time}</span>
                <span class="log-note" style={{ color: padInfo?.color || '#00fff5' }}>
                  {padInfo ? padInfo.name : `Note ${h.note}`}
                </span>
                <span class="log-vel">Velocity: {h.velocity}</span>
                {h.uiAllowed && <span class="log-ui-badge">UI Nav Allowed</span>}
              </div>
            )
          })
        )}
      </div>
    </footer>
  );

  // Auto-hide menu when playing
  useSignalEffect(() => {
    if (isDrillPlaying.value) {
      isQuickMenuOpen.value = false;
    } else {
      isQuickMenuOpen.value = true;
    }
  });

  const isE2E = typeof navigator !== 'undefined' && navigator.webdriver;

  // Session entry: satisfy the browser's gesture requirement, then confirm the
  // kit. Skips itself when autoplay is already granted (installed PWA), so
  // there is one code path rather than an install-aware branch.
  if (!warmedUp && !IS_DEV_VIEW) {
    return <EngineWarmup onReady={() => setWarmedUp(true)} />;
  }

  // Finish first-run setup: remember that placement happened, and skip the
  // calibration prompt entirely if a stored calibration was restored at boot.
  const completeDiagnostic = async () => {
    hasCompletedDiagnostic.value = true;
    await progressionStore.recordPlacement({});
    if (!(await restoreHiHatCalibration())) isCalibrationOpen.value = true;
  };

  return (
    <>
      {hydrated && !hasCompletedDiagnostic.value && !isE2E && (
        <div class="diagnostic-overlay" data-testid="diagnostic-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
          background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', 
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <h2>Welcome to In The Pocket</h2>
          <p>Let's calibrate your drum kit placement.</p>
          <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            <button class="tab-btn active" onClick={completeDiagnostic}>
              Start Placement Diagnostic
            </button>
            <button class="tab-btn" onClick={completeDiagnostic}>Skip</button>
          </div>
        </div>
      )}

      {!isE2E && <HiHatCalibration />}
      
      <ThroneView
        header={header}
        grooveCircle={IS_DEV_VIEW ? devVisual : mainVisual}
        panels={IS_DEV_VIEW ? (<>{sidePanel}<QuickMenu /></>) : <QuickMenu />}
        footer={IS_DEV_VIEW ? footer : undefined}
      />
      <SettingsMenu />
    </>
  )
}
