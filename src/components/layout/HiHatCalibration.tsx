import { useLayoutEffect, useRef } from 'preact/hooks';
import { signal, useSignal } from '@preact/signals';
import { midiEngine } from '../../audio/midi';
import { detectPedalCC, type CcObservation } from '../../audio/pedalDetection';
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

  /**
   * Watch every controller, not just CC#4, and work out which one is the pedal
   * (register P-15).
   *
   * This screen used to poll `midiEngine.cc4Value`, which meant that on a kit
   * whose pedal sends anything other than CC#4 the readout never moved — so
   * the drummer could not calibrate the pedal, and could not tell that from a
   * pedal that was not connected. The controller number is a convention, not a
   * standard.
   *
   * Detection costs the drummer nothing extra: they are already being asked to
   * work the pedal fully open and fully closed, which is exactly the movement
   * that identifies it.
   *
   * useLayoutEffect so the subscription exists before the prompt is painted —
   * see C-52, where a screen visible but not yet listening dropped the first
   * input it asked for.
   */
  const observations = useRef<CcObservation[]>([]);
  const detectedCc = useSignal<number | null>(null);

  useLayoutEffect(() => {
    if (!isCalibrationOpen.value) return;

    const unsubscribe = midiEngine.onControlChange((cc, value) => {
      const seen = observations.current;
      // Bounded: a long calibration must not grow this without limit on the
      // MIDI path. Recent movement is what identifies the pedal anyway.
      if (seen.length >= 512) seen.shift();
      seen.push({ cc, value });

      const result = detectPedalCC(seen);
      if (result.found && result.cc !== detectedCc.value) {
        detectedCc.value = result.cc;
        // Apply immediately so the rest of the app — and the readout below —
        // starts following this kit's actual pedal.
        midiEngine.setPedalCC(result.cc);
      }

      if (detectedCc.value === null || cc === detectedCc.value) {
        // Before detection settles, show whatever is moving, so the drummer
        // gets feedback rather than a dead number.
        currentValue.value = value;
      }
    });

    return () => {
      unsubscribe();
      observations.current = [];
    };
  }, [isCalibrationOpen.value]);

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
      void profilesStore.saveHiHatCalibration(openValue.value, closedValue.value, { cc: detectedCc.value ?? undefined });
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
