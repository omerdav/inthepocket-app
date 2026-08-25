import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import {
  isSettingsMenuOpen,
  isBlindModeEnabled,
  blindModeThreshold,
  metronomeVolume
} from '../../state/settings';
import { errorReporter, type ErrorRecord } from '../../ErrorReporter';
import { isDynamicsCalibratorOpen } from './DynamicsCalibrator';
import './SettingsMenu.css';

const BLIND_THRESHOLDS = [4, 8, 16];
const METRONOME_VOLUMES = [0, 25, 50, 75, 100];

export function SettingsMenu() {
  const focusedIndex = useSignal(0);
  const [logExportStatus, setLogExportStatus] = useState('SHOW');
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<ErrorRecord[]>([]);

  useEffect(() => {
    const handleScrollDown = () => {
      if (!isSettingsMenuOpen.value) return;

      let nextIndex = focusedIndex.value + 1;
      
      // If next is 1 (Threshold) and blind mode is off, skip it
      if (nextIndex === 1 && !isBlindModeEnabled.value) {
        nextIndex = 2;
      }
      
      if (nextIndex > 4) {
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
        isDynamicsCalibratorOpen.value = true;
      } else if (current === 4) {
        void toggleErrorLog();
      }
    };

    /**
     * Show the log, and try the clipboard as a convenience.
     *
     * ON SCREEN FIRST, DELIBERATELY. The clipboard cannot be relied on here:
     * `navigator.clipboard.writeText` needs a focused document and, on
     * Firefox — a supported browser per D5 — transient user activation. A
     * snare hit is not user activation as far as the browser is concerned, so
     * the copy can fail through no fault of the drummer. Measured: calling it
     * without focus returns NotAllowedError, "Document is not focused."
     *
     * A drummer on a stool with a tablet on a stand also has nowhere obvious
     * to paste JSON. Reading it off the screen — or photographing it — is the
     * path that always works, so the copy is the bonus, not the mechanism.
     */
    const toggleErrorLog = async () => {
      if (showLog) {
        setShowLog(false);
        return;
      }
      let entries: ErrorRecord[] = [];
      try {
        entries = await errorReporter.getLogs();
      } catch (err) {
        console.error('Failed to read error log', err);
      }
      setLogs(entries);
      setShowLog(true);

      try {
        await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
        setLogExportStatus('COPIED');
      } catch {
        // Expected in several real situations. The list below is the answer.
        setLogExportStatus('ON SCREEN');
      }
      setTimeout(() => setLogExportStatus('SHOW'), 2000);
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
          <span>Calibrate Dynamics</span>
          <span>[ START ]</span>
        </div>

        <div class={`settings-item ${focusedIndex.value === 4 ? 'focused' : ''}`}>
          <span>Engine Error Log</span>
          <span>[ {logExportStatus} ]</span>
        </div>

        {showLog && (
          <div class="error-log" data-testid="error-log">
            {logs.length === 0 && <div class="error-log-empty">No errors recorded.</div>}
            {logs.map((entry) => (
              <div class="error-log-entry" key={entry.id}>
                <div class="error-log-message">
                  {entry.message}
                  {entry.count > 1 && <span class="error-log-count"> x{entry.count}</span>}
                </div>
                <div class="error-log-meta">
                  {new Date(entry.timestamp).toLocaleString()} · {entry.phase}
                  {entry.drillId ? ` · ${entry.drillId}` : ''}
                  {entry.midiConnected ? ' · kit connected' : ' · no kit'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
