import { signal, useSignalEffect } from '@preact/signals';
import { midiEngine } from '../../audio/midi';

export const isCalibrationOpen = signal<boolean>(false);
export const hasCompletedHiHatCalibration = signal<boolean>(false);

export function HiHatCalibration() {
  const step = signal<0 | 1 | 2>(0); // 0 = start, 1 = open, 2 = closed
  const openValue = signal<number>(0);
  const closedValue = signal<number>(127);
  const currentValue = signal<number>(0);

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
      
      // Calibrate engine
      (window as any).calibrateHiHat?.(openValue.value, closedValue.value);
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
