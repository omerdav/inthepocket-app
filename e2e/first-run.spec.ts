import { test, expect } from './fixtures/virtual-drummer';

test.describe('First-run overlays (T-029)', () => {
  test.beforeEach(async ({ injectVirtualDrummer }) => {
    await injectVirtualDrummer();
  });

  const getDbState = async (page) => {
    return await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        const state = await new Promise((resolve, reject) => {
          const req = indexedDB.open('inthepocket', 2);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('progression')) {
               resolve(undefined);
               return;
            }
            try {
              const tx = db.transaction('progression', 'readonly');
              const store = tx.objectStore('progression');
              const getReq = store.get('state');
              getReq.onsuccess = () => resolve(getReq.result);
              getReq.onerror = () => resolve(undefined);
            } catch (e) {
              resolve(undefined);
            }
          };
          req.onerror = () => resolve(undefined);
        });
        if (state) return state;
        await new Promise(r => setTimeout(r, 100));
      }
      return undefined;
    });
  };

  test('Placement diagnostic renders and can be skipped', async ({ page }) => {
    await page.goto('/?dev=1');
    
    const diag = page.getByTestId('diagnostic-overlay');
    await expect(diag).toBeVisible();
    
    await diag.getByRole('button', { name: 'Skip' }).click();
    await expect(diag).toBeHidden();
    await expect(page.getByTestId('hihat-calibration-overlay')).toBeVisible();

    const state = await getDbState(page);
    expect(state).toBeDefined();
    expect((state as any).placementSkippedAt).toBeTruthy();
    expect((state as any).placementCompletedAt).toBeNull();
  });

  test('Placement diagnostic renders and can be completed', async ({ page }) => {
    await page.goto('/?dev=1');
    
    const diag = page.getByTestId('diagnostic-overlay');
    await expect(diag).toBeVisible();
    
    await diag.getByRole('button', { name: 'Start Placement Diagnostic' }).click();
    await expect(diag).toBeHidden();
    await expect(page.getByTestId('hihat-calibration-overlay')).toBeVisible();

    const state = await getDbState(page);
    expect(state).toBeDefined();
    expect((state as any).placementSkippedAt).toBeNull();
    expect((state as any).placementCompletedAt).toBeTruthy();
    expect((state as any).depths.timing).toBe('developing');
  });

  test('Hi-hat calibration renders and can be completed', async ({ page }) => {
    await page.goto('/?dev=1');
    
    const diag = page.getByTestId('diagnostic-overlay');
    await expect(diag).toBeVisible();
    await diag.getByRole('button', { name: 'Skip' }).click();
    
    const hihat = page.getByTestId('hihat-calibration-overlay');
    await expect(hihat).toBeVisible();
    
    await hihat.getByTestId('calibrate-next-btn').click();
    await expect(hihat.getByText(/COMPLETELY OFF/i)).toBeVisible();
    await hihat.getByTestId('calibrate-next-btn').click();
    await expect(hihat.getByText(/FIRMLY DOWN/i)).toBeVisible();
    await hihat.getByTestId('calibrate-next-btn').click();
    await expect(hihat).toBeHidden();
  });
});
