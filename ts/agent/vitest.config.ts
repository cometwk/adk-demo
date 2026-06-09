import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/bi/**/*.test.ts'],
    testTimeout: 60_000,
  },
})
