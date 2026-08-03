import { test, expect } from '@playwright/test';

/**
 * Deep-link routing for the active drill: `/?drill=<id>`.
 *
 * This is the seam the simulated-drummer suite needs in order to reach any
 * drill other than the default (see Simulation_Suite_Plan.md prerequisite 2).
 * It is deliberately a real URL rather than a test hook, so these assertions
 * exercise a path a user can also reach.
 */

test.describe('Drill deep-link routing', () => {
  test('loads the default drill with no parameter', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('drill-name')).toHaveText(/Even Single Strokes/);
  });

  test('loads a specific drill from the URL', async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-5');
    await expect(page.getByTestId('drill-name')).toHaveText(/Dynamics Gate Graduation/);
  });

  test('reaches the hi-hat bootcamp, previously unreachable', async ({ page }) => {
    await page.goto('/?drill=hh-indep-5');
    await expect(page.getByTestId('drill-name')).toBeVisible();
    const name = await page.getByTestId('drill-name').textContent();
    expect(name).toContain('Hi-Hat Independence');
  });

  test('falls back to the default on an unknown id rather than rendering nothing', async ({ page }) => {
    await page.goto('/?drill=does-not-exist');
    await expect(page.getByTestId('drill-name')).toHaveText(/Even Single Strokes/);
  });

  test('selecting from the menu updates the URL', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('menu-item-dynamics-gate-drill-3').click();
    await expect(page).toHaveURL(/drill=dynamics-gate-drill-3/);
    await expect(page.getByTestId('drill-name')).toHaveText(/Dynamics Gate/);
  });

  test('the back button returns to the previous drill', async ({ page }) => {
    await page.goto('/?drill=dynamics-gate-drill-1');
    await page.getByTestId('menu-item-dynamics-gate-drill-4').click();
    await expect(page).toHaveURL(/drill=dynamics-gate-drill-4/);

    await page.goBack();
    await expect(page).toHaveURL(/drill=dynamics-gate-drill-1/);
    await expect(page.getByTestId('drill-name')).toHaveText(/Even Single Strokes/);
  });

  test('every registered drill is reachable and renders', async ({ page }) => {
    const ids = await page.goto('/').then(async () => {
      return page.evaluate(async () => {
        const { drillIds } = await import('/src/data/registry.ts');
        return drillIds();
      });
    });

    expect(ids.length).toBe(10);

    for (const id of ids) {
      await page.goto(`/?drill=${id}`);
      await expect(page.getByTestId('drill-session')).toBeVisible();
      await expect(page.getByTestId('drill-start')).toBeVisible();
    }
  });
});
