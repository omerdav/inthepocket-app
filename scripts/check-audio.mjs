import { chromium } from '@playwright/test';

async function main() {
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();

    const measurements = await page.evaluate(async () => {
      const ctx = new window.AudioContext();
      const startWall = performance.now();
      const startAudio = ctx.currentTime;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const delays = [255, 522, 1039, 3095];
      const results = [];

      for (const delay of delays) {
        const toWait = delay - (performance.now() - startWall);
        if (toWait > 0) {
          await new Promise(r => setTimeout(r, toWait));
        }
        const wall = performance.now() - startWall;
        const audio = (ctx.currentTime - startAudio) * 1000;
        results.push({ wall, audio });
      }
      return results;
    });

    console.log(' wall(ms)  audio(ms)   ratio');
    let failed = false;
    for (const m of measurements) {
      const ratio = m.audio / m.wall;
      console.log(`${Math.round(m.wall).toString().padStart(9)} ${m.audio.toFixed(1).padStart(10)} ${ratio.toFixed(3).padStart(8)}`);
      
      // We check at the ~3s mark. A wedged machine will be around 0.003.
      // We use 0.1 as a threshold. A busy machine might stutter, but over 3 seconds
      // it will certainly advance more than 300ms of audio context.
      if (m.wall > 3000 && ratio < 0.1) {
        failed = true;
      }
    }

    if (failed) {
      console.error('\nAudio clock is wedged (ratio < 0.1). Preflight failed.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Probe failed to run:', err);
    process.exit(0);
  } finally {
    if (browser) await browser.close();
  }
}

main();
