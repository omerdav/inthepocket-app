import { signal } from '@preact/signals';

export type SessionPhase = 'learn' | 'practice' | 'fun';

export const sessionPhase = signal<SessionPhase>('practice'); // Default to practice
export const isQuickMenuOpen = signal<boolean>(true); // Open by default
export const hasCompletedDiagnostic = signal<boolean>(false);
export const isDrillPlaying = signal<boolean>(false);
