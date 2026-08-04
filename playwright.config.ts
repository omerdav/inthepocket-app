import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  /**
   * `.spec.ts` is Playwright, `.test.ts` is Vitest — a convention the repo
   * already followed but nothing enforced. Playwright's default glob also
   * matches `*.test.ts`, so it tried to load the Vitest files under
   * `e2e/simulation/` and died on their `describe` import.
   */
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  /**
   * Split into two projects so a break in one team's specs cannot block the
   * other's. Playwright aborts *all* collection on a single module-load error,
   * so an undefined reference in a simulation spec previously took the entire
   * suite to "0 tests in 0 files" — leaving product work with no E2E safety
   * net at all, and silently.
   *
   *   npm run test:e2e  → product specs   (what task verification requires)
   *   npm run test:sim  → simulation suite
   */
  projects: [
    {
      name: 'product',
      testDir: './e2e',
      testIgnore: '**/simulation/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'simulation',
      testDir: './e2e/simulation',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
