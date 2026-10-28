import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { getDocument } from '../db/queries.js';
import type { RouteDeps } from './sessions.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const internalRoutes: FastifyPluginAsync<RouteDeps> = async (app, { config }) => {
  app.get<{ Params: { id: string } }>('/internal/documents/:id/file', async (request, reply) => {
    if (!secretMatches(request.headers['x-hotel-secret'], config.n8nWebhookSecret)) {
      return reply
        .code(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid x-hotel-secret header.' } });
    }
    const { id } = request.params;
    const notFound = () => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Document file not found.' } });
    if (!UUID_RE.test(id)) return notFound();
    const doc = await getDocument(id);
    if (!doc) return notFound();
    const file = path.resolve(config.uploadDir, `${id}.pdf`);
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return notFound();
    }
    return reply
      .type('application/pdf')
      .header('Content-Length', size)
      .header('Content-Disposition', 'attachment')
      .send(createReadStream(file));
  });
};
