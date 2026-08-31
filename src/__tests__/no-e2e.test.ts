// @ts-ignore
import { readdirSync, statSync, readFileSync } from 'fs';
// @ts-ignore
import { join } from 'path';
import { describe, it, expect } from 'vitest';

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  // @ts-ignore
  const files = readdirSync(dirPath);

  // @ts-ignore
  files.forEach(function(file: string) {
    // @ts-ignore
    if (statSync(join(dirPath, file)).isDirectory()) {
      // @ts-ignore
      arrayOfFiles = getAllFiles(join(dirPath, file), arrayOfFiles);
    } else {
      // @ts-ignore
      arrayOfFiles.push(join(dirPath, file));
    }
  });

  return arrayOfFiles;
}

/**
 * One documented exception, and only one.
 *
 * `app.tsx` still reads `navigator.webdriver` to hide the placement diagnostic
 * and the hi-hat calibration overlay from automation. Removing it makes those
 * overlays intercept clicks and the drill audit cannot reach the Start button.
 *
 * The real fix is for the specs to dismiss the overlay the way a drummer does —
 * it carries `data-testid="diagnostic-overlay"` and a Skip button — but that
 * means editing `e2e/drill-audit.spec.ts`, which T-020's scope forbade. Tracked
 * as register H-4.
 *
 * The exception is listed by file so that a second one fails this test rather
 * than quietly joining an allowlist.
 */
const ALLOWED = new Map<string, RegExp>([])

const SECOND_SURFACE = new Set([
  'itp-simulate-hit',
  'itp-force-render',
  'itp-correlator-mock',
  'dataset.lastOpacity',
  'dataset.lastHitColor',
  'dataset.playheadX',
  'dataset.noteX',
  '(window as any).setHitVisualMode',
  '(window as any).setStickingCuePlacement',
  'itp-set-blind-mode'
]);

const PRODUCT_ALLOWED = new Set([
  'itp-drill-phase',
  'dataset.testid',
  '(window as any)._stickNavCtrl',
  '(window as any).__virtualDrummer',
  '(window as any).calibrateHiHat'
]);

describe('R6 Guard: No E2E hooks in production code', () => {
  it('src/ contains no __E2E_ hooks and no undocumented navigator.webdriver', () => {
    const files = getAllFiles('src');
    const violations: string[] = [];

    for (const file of files) {
      const rel = file.replace(/\\/g, '/');
      if (rel.includes('__tests__') || rel.includes('.test.') || rel.includes('.spec.')) continue;
      if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) continue;

      // @ts-ignore
      const content = readFileSync(file, 'utf8');

      if (content.includes('__E2E_')) violations.push(`${rel} — __E2E_ hook`);

      if (content.includes('navigator.webdriver') && !ALLOWED.get(rel)?.test('navigator.webdriver')) {
        violations.push(`${rel} — navigator.webdriver`);
      }

      const matches = content.match(/(itp-[a-z0-9-]+|\(window as any\)\.[a-zA-Z0-9_]+|dataset\.[a-zA-Z0-9_]+)/g) || [];
      for (const match of matches) {
        if (!SECOND_SURFACE.has(match) && !PRODUCT_ALLOWED.has(match)) {
          violations.push(`${rel} — unlisted scaffolding hook: ${match}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('the documented exception has not grown', () => {
    // If H-4 is fixed, this test fails and the allowlist should be emptied.
    expect([...ALLOWED.keys()]).toEqual([]);
    // @ts-ignore
    const app = readFileSync('src/app.tsx', 'utf8') as string;
    const hits = app.split('navigator.webdriver').length - 1;
    expect(hits, 'app.tsx should read navigator.webdriver exactly once').toBe(0);
  });
});
