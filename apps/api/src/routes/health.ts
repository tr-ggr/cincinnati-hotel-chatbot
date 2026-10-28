import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { getActiveDocument } from '../db/queries.js';
import type { RouteDeps } from './sessions.js';

export const healthRoutes: FastifyPluginAsync<RouteDeps> = async (app, { config }) => {
  // Exempt from rate limiting (container healthcheck + uptime monitors) and logged at warn+ only, so the
  // 10 s docker healthcheck does not flood the request log.
  app.get('/api/health', { config: { rateLimit: false }, logLevel: 'warn' }, async () => {
    let db: 'up' | 'down' = 'down';
    let activeDocument = false;
    try {
      await query('SELECT 1');
      db = 'up';
      const doc = await getActiveDocument();
      activeDocument = doc?.status === 'ready';
    } catch (err) {
      app.log.warn({ err }, 'health: db check failed');
    }

    let n8n: 'up' | 'down' | 'mock' = 'mock';
    if (!config.n8nMock) {
      try {
        const res = await fetch(`${config.n8nBaseUrl}/healthz`, { signal: AbortSignal.timeout(2000) });
        n8n = res.ok ? 'up' : 'down';
      } catch {
        n8n = 'down';
      }
    }
    return { ok: true, db, n8n, activeDocument };
  });
};
