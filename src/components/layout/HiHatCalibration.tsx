import { signal, useSignal, useSignalEffect } from '@preact/signals';
import { midiEngine } from '../../audio/midi';
import { profilesStore } from '../../store';

export const isCalibrationOpen = signal<boolean>(false);
export const hasCompletedHiHatCalibration = signal<boolean>(false);

/**
 * Re-apply a stored calibration and report whether one existed.
 * Called at boot so a returning drummer is not asked to calibrate again.
 */
export async function restoreHiHatCalibration(): Promise<boolean> {
  const saved = await profilesStore.hiHatCalibration();
  if (!saved) return false;
  (window as any).calibrateHiHat?.(saved.min, saved.max);
  hasCompletedHiHatCalibration.value = true;
  return true;
}

export function HiHatCalibration() {
  const step = useSignal<0 | 1 | 2>(0); // 0 = start, 1 = open, 2 = closed
  const openValue = useSignal<number>(0);
  const closedValue = useSignal<number>(127);
  const currentValue = useSignal<number>(0);

  // Poll current CC#4 value for UI feedback
  useSignalEffect(() => {
    if (!isCalibrationOpen.value) return;

    const interval = setInterval(() => {
      currentValue.value = midiEngine.cc4Value;
    }, 50);

    return () => clearInterval(interval);
  });

  if (!isCalibrationOpen.value) return null;

  const handleNext = () => {
    if (step.value === 0) {
      step.value = 1;
    } else if (step.value === 1) {
      openValue.value = currentValue.value;
      step.value = 2;
    } else if (step.value === 2) {
      closedValue.value = currentValue.value;
      
      // Calibrate engine, then persist — otherwise every reload asks the
      // drummer to recalibrate a pedal that has not moved.
      (window as any).calibrateHiHat?.(openValue.value, closedValue.value);
      void profilesStore.saveHiHatCalibration(openValue.value, closedValue.value);
      hasCompletedHiHatCalibration.value = true;
      isCalibrationOpen.value = false;
    }
  };

  return (
    <div class="diagnostic-overlay" data-testid="hihat-calibration-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
      background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', 
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }}>
      <h2>Hi-Hat Pedal Calibration</h2>
      
      {step.value === 0 && (
        <p>Let's calibrate your hi-hat pedal so it works perfectly with In The Pocket.</p>
      )}

      {step.value === 1 && (
        <div style={{ textAlign: 'center' }}>
          <p>Take your foot <strong>COMPLETELY OFF</strong> the pedal (fully open).</p>
          <div style={{ fontSize: '32px', margin: '20px 0', fontFamily: 'monospace' }}>
            Current Value: {currentValue.value}
          </div>
        </div>
      )}

      {step.value === 2 && (
        <div style={{ textAlign: 'center' }}>
          <p>Press your foot <strong>FIRMLY DOWN</strong> on the pedal (fully closed).</p>
          <div style={{ fontSize: '32px', margin: '20px 0', fontFamily: 'monospace' }}>
            Current Value: {currentValue.value}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
        <button class="tab-btn active" onClick={handleNext} data-testid="calibrate-next-btn">
          {step.value === 0 ? 'Start Calibration' : 'Confirm'}
        </button>
        {step.value > 0 && (
          <button class="tab-btn" onClick={() => isCalibrationOpen.value = false}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
