import { expect, type Page } from '@playwright/test'
import { dismissFirstRun } from './fixtures/virtual-drummer'

/**
 * Walk the session-entry flow the way a drummer does.
 *
 * Deliberately performs the real interactions — a genuine click for the
 * browser's activation gesture, then a genuine MIDI hit to confirm the kit —
 * rather than setting a flag to skip the screen. A helper that bypassed the
 * flow would mean no test ever covered it, which is how the previous suite
 * ended up green while the app did nothing.
 *
 * Playwright's Chromium enforces the autoplay policy, so the tap step here is
 * a real test of the gesture requirement, not a formality.
 */
/**
 * Wait until the app has painted one of the two states session entry can be in,
 * and say which.
 *
 * Register P-19. This used to be `if ((await warmup.count()) === 0)`, asked
 * immediately after `goto` and waiting for nothing, with a count of zero read as
 * "already inside the app". **Absence proves nothing while the page is still
 * mounting** — a blank page that has not painted yet looks exactly the same as a
 * page that is past the warmup screen.
 *
 * While the `?dev=1` route existed the branch had a second, legitimate meaning
 * and mostly held. T-055 deleted that route and left only the race, which failed
 * three tests of 96 in one suite and none in the next — every one of them
 * *inside this helper*, far from the subject of the test that reported it.
 *
 * The two states are mutually exclusive by construction: `App` returns
 * `EngineWarmup` before `ThroneView` exists, so `drill-session` cannot be on the
 * page while `engine-warmup` is, and vice versa. The only third possibility is
 * "neither yet", which is the one worth waiting through.
 */
export async function awaitEntryState(page: Page): Promise<'warmup' | 'inside'> {
  const warmup = page.getByTestId('engine-warmup')
  const session = page.getByTestId('drill-session')

  let state: 'warmup' | 'inside' | null = null

  await expect
    .poll(
      async () => {
        if ((await warmup.count()) > 0) state = 'warmup'
        else if ((await session.count()) > 0) state = 'inside'
        return state
      },
      {
        timeout: 15000,
        message:
          'Neither engine-warmup nor drill-session ever rendered, so the app did ' +
          'not reach session entry at all. This is a failure to start, not a slow ' +
          'warmup — check the console before suspecting a timeout.',
      }
    )
    .not.toBeNull()

  return state!
}

export async function enterApp(page: Page, options: { skipFirstRunDismissal?: boolean } = {}): Promise<void> {
  const warmup = page.getByTestId('engine-warmup')

  // Already inside — autoplay was granted and a kit answered. Established by
  // waiting for a state rather than by reading an absence (P-19).
  if ((await awaitEntryState(page)) === 'inside') {
    if (!options.skipFirstRunDismissal) {
      await dismissFirstRun(page)
      await expect(page.getByTestId('drill-session')).toBeVisible()
    }
    return
  }

  // Wait for preparation to finish before deciding which step we are on.
  // Checking visibility while the screen is still in `loading` would skip the
  // tap and then hang forever waiting for a kit step that never arrives.
  await expect(warmup).toHaveAttribute('data-phase', /awaiting-(tap|kit)/, { timeout: 15000 })

  // Step 1 — the gesture. Absent when autoplay is already granted, in which
  // case the screen goes straight to the kit step.
  if ((await warmup.getAttribute('data-phase')) === 'awaiting-tap') {
    await warmup.click()
  }

  // Step 2 — confirm the kit.
  await expect(warmup).toHaveAttribute('data-phase', 'awaiting-kit', { timeout: 10000 })

  const hasVirtualKit = await page.evaluate(
    () => !!(window as unknown as { __virtualDrummer?: unknown }).__virtualDrummer
  )

  if (hasVirtualKit) {
    // Wait until the MIDI engine has actually attached its listeners. A note
    // sent the moment the kit step renders can land before anything is
    // listening, and is simply lost.
    await page.waitForFunction(
      async () => (await import('/src/audio/midi.ts')).midiEngine.initialized,
      undefined,
      { timeout: 10000 }
    )
    await page.evaluate(() => {
      ;(
        window as unknown as { __virtualDrummer: { hit(n: number, v: number): void } }
      ).__virtualDrummer.hit(38, 100) // snare head
    })
  } else {
    await page.getByTestId('warmup-skip').click({ timeout: 10000 })
  }

  if (!options.skipFirstRunDismissal) {
    await dismissFirstRun(page)
    await expect(page.getByTestId('drill-session')).toBeVisible({ timeout: 10000 })
  }
}
