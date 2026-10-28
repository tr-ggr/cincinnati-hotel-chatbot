import type { FastifyPluginAsync } from 'fastify';

// S0: static placeholder. S1 replaces the 'unknown' fields with real DB / n8n checks.
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/health', async () => ({
    ok: true,
    db: 'unknown',
    n8n: 'unknown',
    activeDocument: false,
  }));
};
