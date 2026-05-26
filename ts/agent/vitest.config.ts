import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/v8/**/*.test.ts'],
    testTimeout: 60_000,
  },
})
