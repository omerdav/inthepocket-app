import { test as base } from '@playwright/test';

type VirtualDrummerFixtures = {
  injectVirtualDrummer: () => Promise<void>;
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
