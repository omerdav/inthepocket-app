import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * Generates the installed-app icons (8.4) from a single source SVG.
 *
 * Run with `npm run generate:icons`. The outputs are committed, because a
 * build should not depend on a rasteriser being installed — but they are
 * generated, not hand-made, so replacing the artwork is one command.
 *
 * SOURCE ARTWORK IS A PLACEHOLDER AND NEEDS AN OWNER DECISION.
 * `public/favicon.svg` is a purple lightning bolt that arrived with the same
 * timestamp as `public/icons.svg`, a social-media sprite sheet (Bluesky and
 * friends) that nothing in the app ever referenced. Both look like template
 * leftovers rather than chosen identity. The sprite has been deleted; the bolt
 * is still here because it is the only mark the app has. Point this at real
 * artwork and re-run — nothing else changes.
 */
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
})
