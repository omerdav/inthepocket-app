import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'e2e/simulation/**/*.test.ts',
      // The audio preflight's judgement (T-032). Lives outside src/ because it
      // is build tooling, not application code, and tsconfig.app only covers src.
      'scripts/**/*.test.mjs',
    ],
  }
})
