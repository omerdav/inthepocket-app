import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { calculatePlacement } from './placementLogic';
import { progressionStore } from '../../store';
import { hasCompletedDiagnostic } from '../../state/session';
import { isCalibrationOpen, restoreHiHatCalibration } from '../layout/HiHatCalibration';

export function DiagnosticOverlay() {
  const focusIndex = useSignal(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      e.preventDefault();
      focusIndex.value = (focusIndex.value + 1) % 2;
    };

    const handleSelect = (e: Event) => {
      e.preventDefault();
      if (focusIndex.value === 0) {
        startDiagnostic();
      } else {
        skipDiagnostic();
      }
    };

    window.addEventListener('stick-scroll-down', handleScroll);
    window.addEventListener('stick-select', handleSelect);

    return () => {
      window.removeEventListener('stick-scroll-down', handleScroll);
      window.removeEventListener('stick-select', handleSelect);
    };
  }, []);

  const handleComplete = async () => {
    hasCompletedDiagnostic.value = true;
    if (!(await restoreHiHatCalibration())) isCalibrationOpen.value = true;
  };

  const startDiagnostic = async () => {
    // Mock the drill result since drill content is out of scope
    const result = calculatePlacement({
      timing: 'basic',
      dynamics: 'consistent',
      independence: 'skipped'
    });
    await progressionStore.recordPlacement(result);
    await handleComplete();
  };

  const skipDiagnostic = async () => {
    await progressionStore.recordPlacementSkip();
    await handleComplete();
  };

  return (
    <div class="diagnostic-overlay" data-testid="diagnostic-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
      background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', 
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <h2>Welcome to In The Pocket</h2>
      <p>Let's calibrate your drum kit placement.</p>
      <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
        <button 
          class={"tab-btn " + (focusIndex.value === 0 ? "focused active" : "")}
          onClick={startDiagnostic}
        >
          Start Placement Diagnostic
        </button>
        <button 
          class={"tab-btn " + (focusIndex.value === 1 ? "focused active" : "")}
          onClick={skipDiagnostic}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
