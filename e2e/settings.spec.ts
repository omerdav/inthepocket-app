import { test, expect } from './fixtures/virtual-drummer';
import { MIDI_NOTE } from '../src/audio/midi';
import { enterApp } from './helpers';

test.describe('Settings Menu UI E2E', () => {
  test.beforeEach(async ({ injectVirtualDrummer, page }) => {
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);
    // Wait for the async initialization of MidiEngine and StickNavigationController to complete
    await expect(page.locator('.midi-status-badge')).toContainText('WebMIDI Active', { timeout: 5000 });
  });

  // Helper to open the menu
  const openMenu = async (page: any, hitDrum: any, sendCC: any) => {
    // Press hi-hat
    await sendCC(4, 100);
    await page.waitForTimeout(50);
    // Double tap Snare Rim
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(50);
    
    // Release hi-hat so subsequent single rim hits aren't treated as a pause gesture
    await sendCC(4, 0);

    // Clear the 80ms rim debounce (UI_DEBOUNCE_MS in midi.ts). The menu was
    // opened with rim hits, so a scroll issued immediately after would be
    // suppressed as an accidental double-trigger — correct product behaviour,
    // and the test has to respect it rather than race it.
    await page.waitForTimeout(120);
  };

  test('Stick Navigation Wrapping', async ({ page, hitDrum, sendCC }) => {
    await openMenu(page, hitDrum, sendCC);
    
    const menu = page.locator('.settings-menu-content');
    await expect(menu).toBeVisible();

    // Start with Blind Mode focused
    await expect(menu.locator('.settings-item.focused')).toContainText('Blind Mode');

<<<<<<< HEAD
    // Blind mode is initially OFF. Items: 0 (Blind Mode), 2 (Metronome Volume), 3 (Calibrate Dynamics).
=======
    // Blind mode is initially OFF. Items: 0 (Blind Mode), 2 (Metronome Volume), 3 (Map My Kit).
>>>>>>> master
    // Scroll down (Snare Rim)
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('Metronome Volume');

    // Scroll down
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
<<<<<<< HEAD
    await expect(menu.locator('.settings-item.focused')).toContainText('Calibrate Dynamics');
=======
    await expect(menu.locator('.settings-item.focused')).toContainText('Map My Kit');
>>>>>>> master

    // Scroll down. T-033 added the engine error log as the last item.
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('Engine Error Log');

    // Scroll down (should wrap back to Blind Mode)
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('Blind Mode');
  });

  test('State Logic (Conditional Skipping) & Dual-Input Selection', async ({ page, hitDrum, sendCC }) => {
    await openMenu(page, hitDrum, sendCC);
    const menu = page.locator('.settings-menu-content');
    await expect(menu).toBeVisible();

    // Blind mode is initially OFF. Let's toggle to ON using Snare Head (38).
    await expect(menu.locator('.settings-item.focused')).toContainText('OFF');
    await hitDrum(MIDI_NOTE.SNARE_HEAD, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('ON'); // Blind Mode is now ON

    // Scroll down. With Blind Mode ON, it should go to Threshold (index 1).
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('Blind Mode Threshold');

    // Toggle threshold value using Kick Drum (36) - Dual-Input Selection test
    // Initial threshold is 4. Let's hit Kick to increment it.
    await expect(menu.locator('.settings-item.focused')).toContainText('4');
    await hitDrum(MIDI_NOTE.KICK, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('8'); // Changes to 8

    // Let's scroll back to Blind Mode to turn it OFF and test the skip
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100); // -> Metronome
    await page.waitForTimeout(100);
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100); // -> Hardware Calib
    await page.waitForTimeout(100);
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100); // -> Engine Error Log (T-033)
    await page.waitForTimeout(100);
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100); // -> Blind Mode
    await page.waitForTimeout(100);

    await expect(menu.locator('.settings-item.focused')).toContainText('Blind Mode');
    // Turn OFF using Snare Head
    await hitDrum(MIDI_NOTE.SNARE_HEAD, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('OFF');

    // Scroll down. Should skip Threshold and go straight to Metronome Volume.
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
    await expect(menu.locator('.settings-item.focused')).toContainText('Metronome Volume');
  });

  test('Escape Gesture', async ({ page, hitDrum, sendCC }) => {
    await openMenu(page, hitDrum, sendCC);
    const menu = page.locator('.settings-menu-content');
    await expect(menu).toBeVisible();

    // Execute Escape gesture: Double tap Snare Rim while Hi-Hat Closed (CC#4 > 90)
    await sendCC(4, 100);
    await page.waitForTimeout(50);
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(100);
    await hitDrum(MIDI_NOTE.SNARE_RIM, 100);
    await page.waitForTimeout(50);

    // Verify the menu closes
    await expect(menu).toBeHidden();
  });
});
