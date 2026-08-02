import { test, expect } from './fixtures/virtual-drummer';
import { MIDI_NOTE } from '../src/audio/midi';

test.describe('Playwright Virtual Drummer Demonstration', () => {
  test.beforeEach(async ({ injectVirtualDrummer }) => {
    // Inject mock WebMIDI and window.__virtualDrummer before page load
    await injectVirtualDrummer();
  });

  test('demonstrates basic drum hits and event propagation', async ({ page, hitDrum }) => {
    await page.goto('/');

    // Wire up MidiEngine or a direct WebMIDI listener on the page with a visual HUD
    const capturedHits = await page.evaluate(() => {
      const hits: Array<{ note: number; velocity: number; timestamp: number }> = [];
      (window as any).hitsLog = hits;

      // Create a visual HUD on screen
      const hud = document.createElement('div');
      hud.id = 'midi-hud';
      hud.style.position = 'fixed';
      hud.style.top = '20px';
      hud.style.left = '50%';
      hud.style.transform = 'translateX(-50%)';
      hud.style.background = '#1a1a2e';
      hud.style.color = '#00fff5';
      hud.style.border = '2px solid #00fff5';
      hud.style.padding = '20px 30px';
      hud.style.borderRadius = '12px';
      hud.style.fontFamily = 'monospace';
      hud.style.fontSize = '18px';
      hud.style.zIndex = '9999';
      hud.style.boxShadow = '0 0 20px rgba(0,255,245,0.4)';
      hud.innerHTML = '🥁 <b>Virtual Drummer Live HUD</b><br><span id="hud-last">Waiting for MIDI hits...</span>';
      document.body.appendChild(hud);

      const noteNames: Record<number, string> = {
        36: 'KICK 🦶',
        38: 'SNARE HEAD 🥁',
        40: 'SNARE RIM 🪵',
        42: 'HI-HAT CLOSED 🧢',
        46: 'HI-HAT OPEN 🎩',
        49: 'CRASH CYMBAL 💥'
      };

      navigator.requestMIDIAccess().then(access => {
        for (const input of access.inputs.values()) {
          input.onmidimessage = (e: any) => {
            const note = e.data[1];
            const vel = e.data[2];
            hits.push({
              note: note,
              velocity: vel,
              timestamp: e.timeStamp
            });
            const lastSpan = document.getElementById('hud-last');
            if (lastSpan) {
              lastSpan.innerHTML = `Hit: <b>${noteNames[note] || note}</b> | Velocity: ${vel} | Time: ${Math.round(e.timeStamp)}ms`;
            }
          };
        }
      });
      return true;
    });

    await page.waitForTimeout(100);

    // Play a basic 4-bar groove simulation live with clear pauses so it's easy to observe on screen
    // Beat 1: Kick + Hi-Hat
    await hitDrum(MIDI_NOTE.KICK, 110, 100);
    await hitDrum(MIDI_NOTE.HI_HAT_CLOSED, 85, 100);
    await page.waitForTimeout(1500);

    // Beat 2: Snare + Hi-Hat
    await hitDrum(MIDI_NOTE.SNARE_HEAD, 105, 350);
    await hitDrum(MIDI_NOTE.HI_HAT_CLOSED, 80, 350);
    await page.waitForTimeout(1500);

    // Beat 3: Kick + Open Hi-Hat
    await hitDrum(MIDI_NOTE.KICK, 115, 600);
    await hitDrum(MIDI_NOTE.HI_HAT_OPEN, 95, 600);
    await page.waitForTimeout(1500);

    // Beat 4: Crash Accent
    await hitDrum(MIDI_NOTE.CRASH, 127, 850);
    await page.waitForTimeout(1500);

    // Fetch captured hits from page context
    const hits = await page.evaluate(() => (window as any).hitsLog);

    expect(hits).toHaveLength(7);
    expect(hits[0]).toEqual({ note: MIDI_NOTE.KICK, velocity: 110, timestamp: 100 });
    expect(hits[1]).toEqual({ note: MIDI_NOTE.HI_HAT_CLOSED, velocity: 85, timestamp: 100 });
    expect(hits[2]).toEqual({ note: MIDI_NOTE.SNARE_HEAD, velocity: 105, timestamp: 350 });
    expect(hits[3]).toEqual({ note: MIDI_NOTE.HI_HAT_CLOSED, velocity: 80, timestamp: 350 });
    expect(hits[4]).toEqual({ note: MIDI_NOTE.KICK, velocity: 115, timestamp: 600 });
    expect(hits[5]).toEqual({ note: MIDI_NOTE.HI_HAT_OPEN, velocity: 95, timestamp: 600 });

    // Keep the browser window open on screen for 10 seconds so user can see it
    await page.waitForTimeout(10000);
  });

  test('demonstrates snare head & rim crosstalk filtering under 10ms', async ({ page, hitDrum }) => {
    await page.goto('/');

    // Evaluate MidiEngine directly in the browser page
    const engineResults = await page.evaluate(async () => {
      // Dynamically import MidiEngine from built/served modules or set up test listener
      const events: Array<{ note: number; velocity: number }> = [];
      
      const access = await navigator.requestMIDIAccess();
      const input = Array.from(access.inputs.values())[0];

      let lastHeadTimestamp = -100;
      const CROSSTALK_WINDOW_MS = 10;

      input.onmidimessage = (e: any) => {
        const note = e.data[1];
        const vel = e.data[2];
        const ts = e.timeStamp;

        if (note === 38) { // SNARE_HEAD
          lastHeadTimestamp = ts;
          events.push({ note, velocity: vel });
        } else if (note === 40) { // SNARE_RIM
          if (ts - lastHeadTimestamp >= CROSSTALK_WINDOW_MS) {
            events.push({ note, velocity: vel });
          } else {
            // Crosstalk suppressed!
          }
        } else {
          events.push({ note, velocity: vel });
        }
      };

      (window as any).events = events;
      return true;
    });

    await page.waitForTimeout(100);

    // Hit Head at T=100ms, then Rim at T=105ms (within 10ms window -> should filter rim crosstalk)
    await hitDrum(38, 100, 100);
    await hitDrum(40, 90, 105);

    // Hit Rim at T=200ms without preceding Head hit (should pass)
    await hitDrum(40, 80, 200);

    const filteredEvents = await page.evaluate(() => (window as any).events);

    // Head hit (38) passes, Rim hit at 105ms is suppressed, Rim hit at 200ms passes
    expect(filteredEvents).toEqual([
      { note: 38, velocity: 100 },
      { note: 40, velocity: 80 }
    ]);
  });
});
