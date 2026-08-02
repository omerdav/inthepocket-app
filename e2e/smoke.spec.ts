import { test, expect } from './fixtures/virtual-drummer';

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
  const eventsCaptured = await page.evaluate(() => {
    window['midiEvents'] = [];
    navigator.requestMIDIAccess().then(access => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = (e) => {
          window['midiEvents'].push({
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
  const receivedEvents = await page.evaluate(() => window['midiEvents']);

  // Verify the hit was received by the mock
  expect(receivedEvents).toHaveLength(1);
  expect(receivedEvents[0].data).toEqual([0x90, 38, 100]);

  // Ensure there were no errors
  const errors = consoleMessages.filter(msg => msg.toLowerCase().includes('error'));
  expect(errors).toHaveLength(0);
});
