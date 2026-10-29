import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { RATE_LIMIT_MAX, type Config } from './config.js';
import { closePool, getPool } from './db/pool.js';
import { createN8nClient, N8nError } from './lib/n8n.js';
import { closeAllSse } from './lib/sse.js';
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

/** Incoming `x-request-id` values are reused only if they look like a plain token (no log/header injection). */
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Proxies we trust for X-Forwarded-For: loopback + private ranges (10/8, 172.16/12, 192.168/16, fc00::/7,
 * link-local). Inside Docker the only hops are nginx (web) and, in prod, cloudflared — both on the private
 * compose network. proxy-addr walks XFF right-to-left and stops at the first non-trusted (public) address,
 * so a client-supplied XFF prefix cannot spoof request.ip once a public hop is in the chain.
 */
const TRUSTED_PROXIES = ['loopback', 'linklocal', 'uniquelocal'];

const LOG_REDACT_PATHS = [
  'req.headers["x-hotel-secret"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const redact = { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' };
  const app = Fastify({
    logger:
      config.nodeEnv === 'development'
        ? { level: 'info', redact, transport: { target: 'pino-pretty', options: { colorize: true } } }
        : { level: 'info', redact },
    trustProxy: TRUSTED_PROXIES,
    requestIdHeader: false,
    requestIdLogLabel: 'reqId',
    genReqId: (req) => {
      const given = req.headers['x-request-id'];
      return typeof given === 'string' && REQUEST_ID_RE.test(given) ? given : randomUUID();
    },
  });

  // Echo the request id so clients / nginx logs can correlate (also carried onto hijacked SSE replies).
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
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
    if (e.statusCode === 429) {
      return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: err.message } });
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
  // Graceful shutdown: end open SSE streams first (otherwise server.close() waits on them forever),
  // then onClose releases the pg pool.
  app.addHook('preClose', async () => {
    const n = closeAllSse();
    if (n > 0) app.log.info({ streams: n }, 'closed SSE streams');
  });
  app.addHook('onClose', async () => {
    await closePool();
    app.log.info('db pool closed');
  });

  const n8n = createN8nClient(config);
  const deps = { config, n8n };

  // The browser only ever calls the API same-origin (nginx in prod, the Vite proxy in dev), so no
  // cross-origin reads are allowed.
  await app.register(cors, { origin: false });
  // Global 60/min/IP. Per-route overrides: upload 10/min (admin.ts); health, stats stream and
  // /internal/* opt out with `config: { rateLimit: false }`.
  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error(`Too many requests. Please retry in ${context.after}.`), {
        statusCode: 429,
        code: 'RATE_LIMITED',
      }),
    onExceeded: (request) => {
      request.log.warn({ ip: request.ip, url: request.url }, 'rate limit exceeded');
    },
  });
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

