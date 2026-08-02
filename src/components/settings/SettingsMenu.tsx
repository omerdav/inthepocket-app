import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import {
  isSettingsMenuOpen,
  isBlindModeEnabled,
  blindModeThreshold,
  metronomeVolume
} from '../../state/settings';
import './SettingsMenu.css';

const BLIND_THRESHOLDS = [4, 8, 16];
const METRONOME_VOLUMES = [0, 25, 50, 75, 100];

export function SettingsMenu() {
  const focusedIndex = useSignal(0);

  useEffect(() => {
    const handleScrollDown = () => {
      if (!isSettingsMenuOpen.value) return;

      let nextIndex = focusedIndex.value + 1;
      
      // If next is 1 (Threshold) and blind mode is off, skip it
      if (nextIndex === 1 && !isBlindModeEnabled.value) {
        nextIndex = 2;
      }
      
      if (nextIndex > 3) {
        nextIndex = 0;
      }
      
      focusedIndex.value = nextIndex;
    };

    const handleSelect = () => {
      if (!isSettingsMenuOpen.value) return;

      const current = focusedIndex.value;
      if (current === 0) {
        isBlindModeEnabled.value = !isBlindModeEnabled.value;
      } else if (current === 1) {
        const idx = BLIND_THRESHOLDS.indexOf(blindModeThreshold.value);
        blindModeThreshold.value = BLIND_THRESHOLDS[(idx + 1) % BLIND_THRESHOLDS.length];
      } else if (current === 2) {
        const idx = METRONOME_VOLUMES.indexOf(metronomeVolume.value);
        metronomeVolume.value = METRONOME_VOLUMES[(idx + 1) % METRONOME_VOLUMES.length];
      } else if (current === 3) {
        console.log("Enter Calibration Mode");
      }
    };

    window.addEventListener('stick-scroll-down', handleScrollDown);
    window.addEventListener('stick-select', handleSelect);

    return () => {
      window.removeEventListener('stick-scroll-down', handleScrollDown);
      window.removeEventListener('stick-select', handleSelect);
    };
  }, []);

  if (!isSettingsMenuOpen.value) return null;

  return (
    <div class="settings-menu-overlay">
      <div class="settings-menu-content">
        <h2 class="settings-title">SETTINGS</h2>
        
        <div class={`settings-item ${focusedIndex.value === 0 ? 'focused' : ''}`}>
          <span>Blind Mode</span>
          <span>{isBlindModeEnabled.value ? 'ON' : 'OFF'}</span>
        </div>

        {/* We keep the threshold item in the DOM but hidden if disabled, OR render it conditionally. 
            If not rendered, we should handle index 1 appropriately in styling, but here index is fixed to 1 */}
        {isBlindModeEnabled.value && (
          <div class={`settings-item ${focusedIndex.value === 1 ? 'focused' : ''}`}>
            <span>Blind Mode Threshold</span>
            <span>{blindModeThreshold.value}</span>
          </div>
        )}

        <div class={`settings-item ${focusedIndex.value === 2 ? 'focused' : ''}`}>
          <span>Metronome Volume</span>
          <span>{metronomeVolume.value}%</span>
        </div>

        <div class={`settings-item ${focusedIndex.value === 3 ? 'focused' : ''}`}>
          <span>Hardware Calibration</span>
          <span>[ START ]</span>
        </div>
      </div>
    </div>
  );
}
