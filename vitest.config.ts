import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,mjs}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.{ts,tsx}'],
      exclude: ['src/core/**/*.test.{ts,tsx}', 'src/core/types.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 90 },
    },
  },
});
