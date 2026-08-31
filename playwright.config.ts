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
  /**
   * Run serially. These are not ordinary UI tests: a drill plays real audio in
   * real time for 6-10 seconds and asserts on millisecond timing. Concurrent
   * browser contexts starve the audio thread and the scheduler, which shows up
   * as failures that move between runs and between tests — indistinguishable,
   * from inside a report, from a genuine regression.
   *
   * That ambiguity is intolerable in a delegated workflow: an agent cannot tell
   * whether it broke something. A slower deterministic suite is worth far more
   * than a fast one nobody can trust.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
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
      // Everything a task must verify against — including the simulation
      // *smoke* suite, which is the only thing that checks the app's feedback
      // is correct rather than merely non-crashing. Excluding it entirely (the
      // previous `**/simulation/**`) meant it never ran in the normal workflow.
      name: 'product',
      testDir: './e2e',
      testIgnore: '**/simulation-matrix.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // The 132-run matrix only. Opt-in via SIMULATION_MATRIX=1 — it takes
      // ~15 minutes, and a break here must never block product verification.
      name: 'simulation',
      testDir: './e2e/simulation',
      testMatch: '**/simulation-matrix.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'offline',
      testDir: './e2e',
      testMatch: '**/offline.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
      },
    },
    {
      name: 'install',
      testDir: './e2e',
      testMatch: '**/install.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4174',
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],
  /**
   * Always start our own dev server; never attach to one already running.
   *
   * This was `reuseExistingServer: !process.env.CI`, which reads as a
   * convenience and behaves as a trap once more than one worktree exists.
   * Every worktree's Playwright reaches for port 5173, so a run started in one
   * tree silently attached to a dev server left behind by another and reported
   * a green result **about code it never executed**.
   *
   * That happened on 2026-08-25 (register P-10): a verification run for
   * `task/T-046-dynamics-calibration` attached to the dev agent's server in
   * another worktree, passed 34 tests including the full thirty-row audit, and
   * the entire result had to be discarded. It was caught only because the two
   * branches happened to differ visibly in the settings menu — branches
   * differing only in logic would have produced a confident, wholly false
   * green.
   *
   * With `false`, an occupied port fails the run immediately with a clear
   * message. That is strictly better: a suite that refuses to start costs
   * minutes, and a suite that verifies the wrong tree costs whatever is built
   * on top of the answer. If this errors, something else is on 5173 — find it
   * and stop it rather than working around this.
   */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
  },
});
