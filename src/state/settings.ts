import { signal } from '@preact/signals';

export const isSettingsMenuOpen = signal(false);
export const isBlindModeEnabled = signal(false);
export const blindModeThreshold = signal(4);
export const metronomeVolume = signal(50);
export const hitVisualMode = signal<'pulse' | 'arrows'>('pulse');
export const stickingCuePlacement = signal<'inside' | 'underneath'>('inside');
