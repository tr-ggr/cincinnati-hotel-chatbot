import { mkdir } from 'node:fs/promises';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { ConfigError, loadConfig, type Config } from './config.js';
import { closePool, getPool } from './db/pool.js';
import { createN8nClient, N8nError } from './lib/n8n.js';
import { adminRoutes } from './routes/admin.js';
import { healthRoutes } from './routes/health.js';
import { internalRoutes } from './routes/internal.js';
import { registerLeadRoutes } from './routes/leads.js';
import { registerSessionRoutes } from './routes/sessions.js';

function toUpperSnake(s: string): string {
  return s
    .replace(/^FST_ERR_/, '')
    .replace(/^FST_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'development'
        ? { level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } }
        : { level: 'info' },
  });

  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    const e = err as FastifyError;
    if (err instanceof ZodError || e.validation) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: err.message } });
    }
    if (err instanceof N8nError) {
      request.log.error({ err }, 'n8n error');
      return reply
        .code(502)
        .send({ error: { code: 'ASSISTANT_UNAVAILABLE', message: 'The assistant is temporarily unavailable.' } });
    }
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .code(413)
        .send({ error: { code: 'FILE_TOO_LARGE', message: `File exceeds the ${config.maxUploadMb} MB limit.` } });
    }
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      const code = e.code ? toUpperSnake(e.code) : 'BAD_REQUEST';
      return reply.code(e.statusCode).send({ error: { code, message: err.message } });
    }
    request.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  await mkdir(config.uploadDir, { recursive: true });
  getPool(config.databaseUrl);
  app.addHook('onClose', closePool);

  const n8n = createN8nClient(config);
  const deps = { config, n8n };

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1 },
  });
  await app.register(healthRoutes, deps);
  await app.register(registerSessionRoutes, deps);
  await app.register(registerLeadRoutes, deps);
  await app.register(adminRoutes, deps);
  await app.register(internalRoutes, deps);

  return app;
}

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const app = await buildApp(config);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
