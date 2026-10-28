import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev only: the API runs on the host at :3000 by default (`pnpm dev` at repo root).
// Set API_PORT to proxy elsewhere (e.g. API_PORT=3001 for the dockerised API on API_HOST_PORT).
// In Docker, nginx proxies /api instead (see nginx.conf).
const apiPort = process.env.API_PORT ?? '3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
  preview: {
    port: 4173,
  },
});
