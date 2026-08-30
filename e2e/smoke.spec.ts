import { test, expect } from './fixtures/virtual-drummer';

/**
 * The page-side scratch array this spec installs to prove the MIDI mock fires.
 * Declared rather than reached through an index signature, so a typo in the
 * property name is a compile error instead of an undefined at runtime.
 */
declare global {
  interface Window {
    midiEvents: Array<{ data: number[]; timeStamp: number }>
  }
}


test('virtual drummer smoke test', async ({ page, injectVirtualDrummer, hitDrum }) => {
  // Inject the mock BEFORE navigating
  await injectVirtualDrummer();

  // Keep track of console messages that might indicate a hit
  const consoleMessages: string[] = [];
  page.on('console', msg => {
    consoleMessages.push(msg.text());
  });

  // Navigate to the app
  await page.goto('/');

  // Wait for the app to initialize
  await page.waitForTimeout(500);

  // Add a manual listener in the page to verify the mock actually fires events
  // This verifies our mock works even before the app implements WebMidi.js
  // Side effects only: installs the listener and the scratch array.
  await page.evaluate(() => {
    window.midiEvents = [];
    navigator.requestMIDIAccess().then(access => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = (e) => {
          // `e.data` is Uint8Array | null. Array.from(null) throws, so a
          // MIDI event without a data payload would have taken the listener
          // down mid-capture rather than being skipped — which is exactly the
          // kind of thing that only shows up on unfamiliar hardware.
          if (!e.data) return;
          window.midiEvents.push({
            data: Array.from(e.data),
            timeStamp: e.timeStamp
          });
        };
      }
    });
    return true;
  });

  // Small delay to ensure the promise resolved and listener is attached
  await page.waitForTimeout(100);

  // Send a single snare hit (note 38, velocity 100)
  await hitDrum(38, 100);

  // Fetch the captured events
  const receivedEvents = await page.evaluate(() => window.midiEvents);

  // Verify the hit was received by the mock
  expect(receivedEvents).toHaveLength(1);
  expect(receivedEvents[0].data).toEqual([0x90, 38, 100]);

  // Ensure there were no errors
  const errors = consoleMessages.filter(msg => msg.toLowerCase().includes('error'));
  expect(errors).toHaveLength(0);
});
