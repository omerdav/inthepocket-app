// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StickNavigationController, DEFAULT_STICK_NAV_CONFIG, type StickNavConfig } from '../StickNavigationController';
import type { MidiEngine, HitEvent } from '../midi';

describe('StickNavigationController', () => {
  let controller: StickNavigationController;
  let hitCallback: (event: HitEvent) => void;
  let mockUnsubscribe: ReturnType<typeof vi.fn>;
  let mockEngine: MidiEngine;
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

  // Tracks hi-hat state for mock getters
  let _hiHatClosed = true;
  let _cc4Value = 127;

  beforeEach(() => {
    _hiHatClosed = true;
    _cc4Value = 127;
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    mockUnsubscribe = vi.fn();
    mockEngine = {
      onHit: vi.fn((cb) => {
        hitCallback = cb;
        return mockUnsubscribe;
      }),
      get hiHatClosed() { return _hiHatClosed; },
      get cc4Value() { return _cc4Value; }
    } as unknown as MidiEngine;

    controller = new StickNavigationController(mockEngine);
    controller.enable(); // Must call enable() to subscribe to onHit
  });

  afterEach(() => {
    controller.dispose();
    vi.restoreAllMocks();
  });

  // Helper to create a hit event
  const makeHit = (note: number, timestamp: number, uiNavigationAllowed = true): HitEvent => ({
    note, velocity: 100, timestamp, seq: 0, uiNavigationAllowed, deltaMs: 0,
  });

  // a) Dynamic mapping tests
  describe('Dynamic mapping', () => {
    it('uses default config to map note 40 to scroll-down', () => {
      hitCallback(makeHit(40, 1000));
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-scroll-down' }));
    });

    it('can change scroll-down mapping to note 45', () => {
      const newConfig: StickNavConfig = {
        ...DEFAULT_STICK_NAV_CONFIG,
        scrollDown: { notes: [45] },
      };
      controller.setConfig(newConfig);

      hitCallback(makeHit(45, 1000));
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-scroll-down' }));

      dispatchEventSpy.mockClear();
      hitCallback(makeHit(40, 2000));
      // Note 40 is no longer mapped to scroll-down, but it IS still mapped to pause
      // So it should NOT fire stick-scroll-down
      const scrollEvents = dispatchEventSpy.mock.calls.filter(
        ([e]: [Event]) => (e as CustomEvent).type === 'stick-scroll-down'
      );
      expect(scrollEvents).toHaveLength(0);
    });
  });

  // b) Select action tests
  describe('Select action', () => {
    it('fires stick-select for Snare Head (38)', () => {
      hitCallback(makeHit(38, 1000));
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-select' }));
    });

    it('fires stick-select for Kick (36)', () => {
      hitCallback(makeHit(36, 1000));
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-select' }));
    });

    it('does NOT fire stick-select for other notes', () => {
      hitCallback(makeHit(49, 1000));
      expect(dispatchEventSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-select' }));
    });
  });

  // c) Pause gesture tests
  describe('Pause gesture', () => {
    it('does NOT fire stick-pause on single rim tap with hihat closed', () => {
      hitCallback(makeHit(40, 1000));
      expect(dispatchEventSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-pause' }));
    });

    it('fires stick-pause on two rim taps <250ms apart with hihat closed', () => {
      hitCallback(makeHit(40, 1000));
      hitCallback(makeHit(40, 1200)); // 200ms apart
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-pause' }));
    });

    it('does NOT fire stick-pause on two rim taps <250ms apart with hihat OPEN (CC#4 < 90)', () => {
      _hiHatClosed = false;
      _cc4Value = 50;
      hitCallback(makeHit(40, 1000));
      hitCallback(makeHit(40, 1200));
      expect(dispatchEventSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-pause' }));
    });

    it('does NOT fire stick-pause on two rim taps >250ms apart with hihat closed', () => {
      hitCallback(makeHit(40, 1000));
      hitCallback(makeHit(40, 1300)); // 300ms apart
      expect(dispatchEventSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-pause' }));
    });
  });

  // d) Priority tests
  describe('Priority tests', () => {
    it('does NOT fire stick-scroll-down on the second hit of a pause gesture', () => {
      hitCallback(makeHit(40, 1000));
      dispatchEventSpy.mockClear();
      hitCallback(makeHit(40, 1200)); // This triggers pause
      // Should have pause but NOT scroll-down
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-pause' }));
      expect(dispatchEventSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-scroll-down' }));
    });

    it('SHOULD fire stick-scroll-down on single rim tap (not part of pause)', () => {
      hitCallback(makeHit(40, 1000));
      expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'stick-scroll-down' }));
    });
  });

  // e) Lifecycle tests
  describe('Lifecycle tests', () => {
    it('stops event dispatch when disabled', () => {
      controller.disable();
      dispatchEventSpy.mockClear();
      // hitCallback is now detached — calling it should have no effect
      // (In the real implementation, the unsubscribe was called so MidiEngine won't call it)
      // We verify disable() was called by checking the unsubscribe mock
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('cleans up MidiEngine subscription on dispose', () => {
      const freshUnsubscribe = vi.fn();
      const freshEngine = {
        onHit: vi.fn().mockReturnValue(freshUnsubscribe),
        get hiHatClosed() { return true; },
        get cc4Value() { return 127; }
      } as unknown as MidiEngine;

      const freshController = new StickNavigationController(freshEngine);
      freshController.enable();
      freshController.dispose();

      expect(freshUnsubscribe).toHaveBeenCalled();
    });
  });
});
