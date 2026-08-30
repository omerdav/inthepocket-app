import { test, expect } from '@playwright/test';
import { enterApp } from './helpers';

const SEED_STATE = {
  drills: {
    'dynamics-gate-drill-1': {
      drillId: 'dynamics-gate-drill-1',
      attempts: 5,
      passes: 0,
      bestAccuracyPercent: 80,
      lastAttemptAt: 1000,
      masteredAt: null
    },
    'hihat-independence-drill-1': {
      drillId: 'hihat-independence-drill-1',
      attempts: 2,
      passes: 2,
      bestAccuracyPercent: 95,
      lastAttemptAt: 5000,
      masteredAt: 5000
    }
  },
  depths: { timing: 'introduction', dynamics: 'developing', independence: 'consolidating' },
  placementCompletedAt: null,
  streak: { current: 4, longest: 12, lastPracticeDay: new Date().toISOString().slice(0, 10) }
};

test.describe('Progression surfacing', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER:', msg.type() + ': ' + msg.text()));
    
    // Navigate to app so DB is initialized
    await page.goto('/');
    
    // Seed IndexedDB
    await page.evaluate(async (state) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('inthepocket', 2);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(state.storeName, 'readwrite');
          tx.objectStore(state.storeName).put(state.data, 'state');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, { storeName: 'progression', data: SEED_STATE });

    // Reload so the app reads the new state
    await page.reload();
    await enterApp(page);
  });

  test('surfaces depths, streak, and next recommendation', async ({ page }) => {
    // QuickMenu is open by default on first load since no drill is active.
    // Wait for the panel
    await expect(page.getByTestId('quick-menu-panel')).toBeVisible();

    await expect(page.getByTestId('streak')).toContainText('Streak: 4');
    await expect(page.getByTestId('streak')).toContainText('Best: 12');

    // Verify depths
    await expect(page.getByTestId('depth-timing')).toContainText('introduction');
    await expect(page.getByTestId('depth-dynamics')).toContainText('developing');
    await expect(page.getByTestId('depth-independence')).toContainText('consolidating');

    // Verify "Play Next" item
    // The oldest unmastered drill is 'dynamics-gate-drill-1' (lastAttemptAt 1000)
    // hihat is mastered, so it won't be recommended.
    const nextItem = page.getByTestId('menu-item-next-drill');
    await expect(nextItem).toBeVisible();
    await expect(page.getByTestId('recommended-section')).toContainText('Play Next');
    
    // It should display the name of dynamics-gate-drill-1
    await expect(nextItem).toContainText('Even Single Strokes');
  });
});
