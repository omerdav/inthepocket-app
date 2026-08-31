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
import { DynamicsCalibrator } from './components/settings/DynamicsCalibrator'
import { KitMapper } from './components/settings/KitMapper'
import { UnrecognisedPadHint } from './components/settings/UnrecognisedPadHint'
import { progressionStore } from './store'
import { EngineWarmup } from './components/layout/EngineWarmup'
import { hasCompletedDiagnostic, isQuickMenuOpen, isDrillPlaying } from './state/session'
import { useSignalEffect } from '@preact/signals'
import { DiagnosticOverlay } from './components/placement/DiagnosticOverlay'

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

export function App() {
  const [midiConnected, setMidiConnected] = useState(false)
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
        const state = await progressionStore.load()
        placed = state.placementCompletedAt != null || state.placementSkippedAt != null
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
  const scoringWorkerRef = useRef<Worker | null>(null)

  useEffect(() => {
    // Initialize ScoringWorker
    const worker = new Worker(new URL('./workers/ScoringWorker.ts', import.meta.url), { type: 'module' })
    worker.postMessage({ type: 'init', bufferSize: 128 })
    
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

    const handleGlobalPause = () => {
      isSettingsMenuOpen.value = !isSettingsMenuOpen.value;
    };
    window.addEventListener('stick-pause', handleGlobalPause);

    return () => {
      window.removeEventListener('stick-pause', handleGlobalPause)
      if (scoringWorkerRef.current) {
        scoringWorkerRef.current.terminate()
        scoringWorkerRef.current = null
      }
      if ((window as any)._stickNavCtrl) {
        (window as any)._stickNavCtrl.dispose()
      }
    }
  }, [])



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



  // Auto-hide menu when playing
  useSignalEffect(() => {
    if (isDrillPlaying.value) {
      isQuickMenuOpen.value = false;
    } else {
      isQuickMenuOpen.value = true;
    }
  });

  // Session entry: satisfy the browser's gesture requirement, then confirm the
  // kit. Skips itself when autoplay is already granted (installed PWA), so
  // there is one code path rather than an install-aware branch.
  if (!warmedUp) {
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
      {hydrated && !hasCompletedDiagnostic.value && scoringWorker && (
        <DiagnosticOverlay worker={scoringWorker} onComplete={completeDiagnostic} />
      )}

      <DynamicsCalibrator />
      <KitMapper />
      <UnrecognisedPadHint />
      <HiHatCalibration />
      
      <ThroneView
        header={header}
        grooveCircle={mainVisual}
        panels={<QuickMenu />}
      />
      <SettingsMenu />
    </>
  )
}
