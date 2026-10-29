import { defineConfig } from 'vitest/config';

// Unit tests for src/lib only (node environment, no DOM); browser flows are covered by apps/e2e.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
