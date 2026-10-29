import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// The stack must already be running: `docker compose up -d --build --wait` at the repo root.
// The root .env supplies N8N_WEBHOOK_SECRET / LEAD_TO for the `real` project (Node's built-in loader, no dotenv).
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // no .env: fine for the ui/api projects
}

// On machines where `localhost` resolves to an unrelated IPv4 server, override with
// E2E_BASE_URL='http://[::1]:8080'.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    // Uploads the sample PDF and walks the HTTP contract; every other project needs its ready document.
    { name: 'api', testMatch: 'api/**/*.spec.ts' },
    {
      name: 'ui',
      testMatch: 'ui/**/*.spec.ts',
      dependencies: ['api'],
      use: { ...devices['Desktop Chrome'] },
    },
    // Real OpenAI + Resend through n8n (`pnpm e2e:real`); skipped automatically when the API runs in mock mode.
    { name: 'real', testMatch: 'real/**/*.spec.ts', dependencies: ['api'] },
  ],
});
