import { describe, it, expect, vi } from 'vitest';
import { HiHatStateTracker } from '../HiHatStateTracker';

describe('HiHatStateTracker CC#4 Hysteresis & Filtering', () => {

  it('rejects noise and emits exactly one chick event during a fast close', () => {
    const onEvent = vi.fn();
    const tracker = new HiHatStateTracker({ onEvent });
    tracker.calibrate(0, 127);

    // Initial state: partial
    
    // Move to open
    tracker.processCC(0, 100);
    expect(onEvent).toHaveBeenCalledWith('hihat-open', 0, 100);
    onEvent.mockClear();

    // Noisy stream towards closed over 50ms
    tracker.processCC(10, 110);
    tracker.processCC(5, 115); // jitter back
    tracker.processCC(50, 120);
    tracker.processCC(40, 125); // jitter back
    tracker.processCC(120, 140); // crossed 90% threshold (114)
    tracker.processCC(127, 150);

    // Should emit one hihat-closed and one hihat-chick (because 140 - 100 <= 300ms)
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, 'hihat-closed', 120, 140);
    
    // chick event should have velocity
    const chickCall = onEvent.mock.calls[1];
    expect(chickCall[0]).toBe('hihat-chick');
    expect(chickCall[1]).toBeGreaterThan(1);
    expect(chickCall[2]).toBe(140);
  });

  it('handles reversed pedal polarity (min=127, max=0)', () => {
    const onEvent = vi.fn();
    const tracker = new HiHatStateTracker({ onEvent });
    tracker.calibrate(127, 0); // Reversed polarity (Yamaha style)

    // Open is 127
    tracker.processCC(127, 100);
    expect(onEvent).toHaveBeenCalledWith('hihat-open', 127, 100);
    onEvent.mockClear();

    // Closed is 0 (travel from 127 -> 0)
    // 90% closed would be 12.7
    tracker.processCC(60, 110); // partial
    tracker.processCC(10, 140); // closed
    
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, 'hihat-closed', 10, 140);
    expect(onEvent).toHaveBeenNthCalledWith(2, 'hihat-chick', expect.any(Number), 140);
  });
});
