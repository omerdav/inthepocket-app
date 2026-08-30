import { test as base } from '@playwright/test';

type VirtualDrummerFixtures = {
  injectVirtualDrummer: () => Promise<void>;
  disconnectKit: () => Promise<void>;
  connectKit: () => Promise<void>;
  hitDrum: (noteNumber: number, velocity: number, timestampMs?: number) => Promise<void>;
  sendCC: (ccNumber: number, value: number, timestampMs?: number) => Promise<void>;
};

export const test = base.extend<VirtualDrummerFixtures>({
  injectVirtualDrummer: async ({ page }, use) => {
    const injectFn = async () => {
      await page.addInitScript(() => {
        class MockMIDIInput extends EventTarget {
          id = 'mock-drum-kit';
          name = 'Mock Virtual Drum Kit';
          manufacturer = 'InThePocket';
          version = '1.0';
          type = 'input';
          state = 'connected';
          connection = 'open';

          onmidimessage: ((event: Event) => void) | null = null;
          
          constructor() {
            super();
          }

          async open() {
            this.connection = 'open';
            return this;
          }

          async close() {
            this.connection = 'closed';
            return this;
          }
        }

        const mockInput = new MockMIDIInput();
        
        // Mock MIDIAccess map-like structure
        const mockInputsMap = new Map();
        mockInputsMap.set(mockInput.id, mockInput);

        const mockMIDIAccess = {
          inputs: mockInputsMap,
          outputs: new Map(),
          onstatechange: null,
          sysexEnabled: false
        };

        // Inject requestMIDIAccess
        Object.defineProperty(navigator, 'requestMIDIAccess', {
          value: () => Promise.resolve(mockMIDIAccess),
          writable: true,
          configurable: true,
        });

        // Add a global __virtualDrummer object for testing
        (window as any).__virtualDrummer = {
          disconnect: () => {
            mockInputsMap.delete(mockInput.id);
            if (mockMIDIAccess.onstatechange) {
              const event = new Event('statechange');
              (event as any).port = { ...mockInput, state: 'disconnected' };
              // The handler is typed to take a MIDIConnectionEvent; the mock
              // builds a plain Event and attaches `port`, which is what the
              // app actually reads. Cast at the call rather than pretending
              // the mock is a real MIDIConnectionEvent.
              (mockMIDIAccess.onstatechange as (e: Event) => void)(event);
            }
          },
          connect: () => {
            mockInputsMap.set(mockInput.id, mockInput);
            if (mockMIDIAccess.onstatechange) {
              const event = new Event('statechange');
              (event as any).port = { ...mockInput, state: 'connected' };
              // The handler is typed to take a MIDIConnectionEvent; the mock
              // builds a plain Event and attaches `port`, which is what the
              // app actually reads. Cast at the call rather than pretending
              // the mock is a real MIDIConnectionEvent.
              (mockMIDIAccess.onstatechange as (e: Event) => void)(event);
            }
          },
          hit: (noteNumber: number, velocity: number, timestampMs = performance.now()) => {
            const data = new Uint8Array([0x90, noteNumber, velocity]);
            
            // Construct a fake MIDIMessageEvent
            const event = new Event('midimessage');
            (event as any).data = data;
            
            // Override timeStamp getter to provide custom timestamp
            Object.defineProperty(event, 'timeStamp', {
              value: timestampMs
            });

            mockInput.dispatchEvent(event);
            
            if (typeof mockInput.onmidimessage === 'function') {
              mockInput.onmidimessage(event);
            }
          },
          cc: (ccNumber: number, value: number, timestampMs = performance.now()) => {
            const data = new Uint8Array([0xB0, ccNumber, value]);
            
            // Construct a fake MIDIMessageEvent
            const event = new Event('midimessage');
            (event as any).data = data;
            
            // Override timeStamp getter to provide custom timestamp
            Object.defineProperty(event, 'timeStamp', {
              value: timestampMs
            });

            mockInput.dispatchEvent(event);
            
            if (typeof mockInput.onmidimessage === 'function') {
              mockInput.onmidimessage(event);
            }
          }
        };
      });
    };
    await use(injectFn);
  },
  
  disconnectKit: async ({ page }, use) => {
    const fn = async () => {
      await page.evaluate(() => {
        (window as any).__virtualDrummer.disconnect();
      });
    };
    await use(fn);
  },
  
  connectKit: async ({ page }, use) => {
    const fn = async () => {
      await page.evaluate(() => {
        (window as any).__virtualDrummer.connect();
      });
    };
    await use(fn);
  },
  
  hitDrum: async ({ page }, use) => {
    const hitFn = async (noteNumber: number, velocity: number, timestampMs?: number) => {
      await page.evaluate(({ note, vel, ts }) => {
        (window as any).__virtualDrummer.hit(note, vel, ts);
      }, { note: noteNumber, vel: velocity, ts: timestampMs });
    };
    await use(hitFn);
  },
  
  sendCC: async ({ page }, use) => {
    const ccFn = async (ccNumber: number, value: number, timestampMs?: number) => {
      await page.evaluate(({ cc, val, ts }) => {
        (window as any).__virtualDrummer.cc(cc, val, ts);
      }, { cc: ccNumber, val: value, ts: timestampMs });
    };
    await use(ccFn);
  }
});

export { expect } from '@playwright/test';

/**
 * Pages whose first-run overlays have already been cleared.
 *
 * The overlays appear once per browser context: dismissing them persists
 * `hasCompletedDiagnostic` and the calibration, so every later navigation in
 * the same page is already past them. The waits below are therefore paid once
 * rather than per `goto`.
 *
 * That distinction is not cosmetic. At 3s + 2s per call, a spec looping over
 * ten drills spent fifty seconds waiting for overlays that could never appear
 * and blew a thirty-second budget.
 *
 * Racing the overlay against the app instead of waiting for it looks faster
 * and is wrong: `drill-session` can become visible a moment before the overlay
 * mounts, the check then finds nothing to dismiss, and the overlay is left
 * covering the UI. Waiting for the overlay specifically — just once — is both
 * correct and cheap.
 */
const firstRunCleared = new WeakSet<object>();

export async function dismissFirstRun(page: any): Promise<void> {
  if (firstRunCleared.has(page)) return;
  firstRunCleared.add(page);

  const diagOverlay = page.getByTestId('diagnostic-overlay');
  try {
    await diagOverlay.waitFor({ state: 'visible', timeout: 3000 });
  } catch (e) {}

  if (await diagOverlay.isVisible()) {
    await diagOverlay.getByRole('button', { name: 'Skip' }).click();
    await diagOverlay.waitFor({ state: 'hidden' });
  }

  const hihatOverlay = page.getByTestId('hihat-calibration-overlay');
  try {
    await hihatOverlay.waitFor({ state: 'visible', timeout: 2000 });
  } catch (e) {}

  if (await hihatOverlay.isVisible()) {
    const cancelBtn = hihatOverlay.getByRole('button', { name: 'Cancel' });
    if (await hihatOverlay.getByRole('button', { name: 'Start Calibration' }).isVisible()) {
      await hihatOverlay.getByRole('button', { name: 'Start Calibration' }).click();
    }
    await cancelBtn.waitFor({ state: 'visible' });
    await cancelBtn.click();
    await hihatOverlay.waitFor({ state: 'hidden' });
  }
}
