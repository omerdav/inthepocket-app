import { test, expect, dismissFirstRun } from './fixtures/virtual-drummer';
import { enterApp } from './helpers';

test.describe('Disconnect, Backgrounding, Hot-Plug', () => {
  test('disconnect mid-drill', async ({ page, injectVirtualDrummer, disconnectKit }) => {
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);

    await page.getByTestId('drill-start').click(); // start drill
    await expect(page.getByTestId('playing')).toBeVisible();

    await disconnectKit();
    await page.waitForTimeout(10000); // Wait for the drill to naturally finish (usually ~5-10 seconds)
    
    // what happens?
    const text = await page.textContent('body');
    console.log('DISCONNECT OUTCOME:', text?.substring(0, 500));
  });

  test('hide tab mid-drill', async ({ page, injectVirtualDrummer }) => {
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);

    await page.getByTestId('drill-start').click(); // start drill
    await expect(page.getByTestId('playing')).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    await page.waitForTimeout(3000);
    const text = await page.textContent('body');
    console.log('HIDE TAB OUTCOME:', text?.substring(0, 500));
  });

  test('connect kit after load', async ({ page, injectVirtualDrummer, connectKit, disconnectKit }) => {
    await injectVirtualDrummer();
    await page.goto('/');
    await enterApp(page);
    
    // First, disconnect the kit so the app thinks there is no kit.
    await disconnectKit();
    await page.waitForTimeout(500);

    // Then start a drill
    await page.getByTestId('drill-start').click();
    await page.waitForTimeout(500);
    
    // Now hot-plug the kit
    await connectKit();
    await page.waitForTimeout(10000);
    
    const text = await page.textContent('body');
    console.log('HOT PLUG OUTCOME:', text?.substring(0, 500));
  });
});
