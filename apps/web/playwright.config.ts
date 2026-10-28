import { defineConfig, devices } from '@playwright/test';

// The stack must already be running in mock mode (see docs/ARCHITECTURE.md §8).
// On machines where `localhost` resolves to an unrelated IPv4 server, override with
// E2E_BASE_URL='http://[::1]:8080'.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
