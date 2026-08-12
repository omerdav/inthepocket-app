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
export async function enterApp(page: Page): Promise<void> {
  const warmup = page.getByTestId('engine-warmup')

  // Already inside (dev route, or autoplay was granted and a kit answered).
  if ((await warmup.count()) === 0) {
    await dismissFirstRun(page)
    await expect(page.getByTestId('drill-session')).toBeVisible()
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

  await dismissFirstRun(page)
  await expect(page.getByTestId('drill-session')).toBeVisible({ timeout: 10000 })
}
