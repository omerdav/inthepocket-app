import { useState, useEffect } from 'preact/hooks';
import { progressionStore } from '../../store';
import type { ProgressionState } from '../../store/ProgressionStore';
import { isQuickMenuOpen } from '../../state/session';

export function useProgression() {
  const [state, setState] = useState<ProgressionState | null>(null);

  useEffect(() => {
    // Only load state when the QuickMenu is open
    // This avoids needless DB reads when the menu is closed.
    if (isQuickMenuOpen.value) {
      progressionStore.load().then(setState).catch(console.error);
    }
  }, [isQuickMenuOpen.value]);

  return state;
}
