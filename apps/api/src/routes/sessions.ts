import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { N8nClient } from '../lib/n8n.js';
import { isCategory } from '../lib/categories.js';
import { emitStatsChanged } from '../lib/events.js';
import {
  createSession,
  getActiveDocument,
  getSession,
  insertMessage,
  listMessages,
  listRecentMessages,
  toMessageDto,
  touchSession,
  updateMessageClassification,
} from '../db/queries.js';

export interface RouteDeps {
  config: Config;
  n8n: N8nClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const paramsSchema = z.object({ id: z.string() });
const messageBodySchema = z.object({ content: z.string().trim().min(1).max(2000) });

export function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

export function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

export const registerSessionRoutes: FastifyPluginAsync<RouteDeps> = async (app, { n8n }) => {
  app.post('/api/sessions', async (request, reply) => {
    const ua = request.headers['user-agent'];
    const session = await createSession(typeof ua === 'string' ? ua : null);
    emitStatsChanged();
    return reply.code(201).send({ id: session.id, startedAt: session.startedAt });
  });

  app.get('/api/sessions/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const notFound = () => sendError(reply, 404, 'SESSION_NOT_FOUND', 'Session not found');
    if (!UUID_RE.test(id)) return notFound();
    const session = await getSession(id);
    if (!session) return notFound();
    const messages = await listMessages(id);
    return reply.code(200).send({
      id: session.id,
      startedAt: session.startedAt,
      messages: messages.map(toMessageDto),
    });
  });

  app.post('/api/sessions/:id/messages', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    // 1. validate body, load session, load active ready document
    const body = messageBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', summarizeIssues(body.error));
    }
    if (!UUID_RE.test(id)) return sendError(reply, 404, 'SESSION_NOT_FOUND', 'Session not found');
    const session = await getSession(id);
    if (!session) return sendError(reply, 404, 'SESSION_NOT_FOUND', 'Session not found');
    const doc = await getActiveDocument();
    if (!doc || doc.status !== 'ready') {
      return sendError(reply, 409, 'NO_DOCUMENT', 'No document is available yet. Please try again later.');
    }

    // 2. insert user message
    const userRow = await insertMessage({ sessionId: id, role: 'user', content: body.data.content });

    // 3. call WF2
    const history = (await listRecentMessages(id, 8, userRow.id)).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const started = performance.now();
    let result: Awaited<ReturnType<N8nClient['chat']>>;
    try {
      result = await n8n.chat({
        session_id: id,
        message_id: userRow.id,
        question: body.data.content,
        document_id: doc.id,
        history,
      });
    } catch (err) {
      // 5. failure: leave the user message, report 502
      request.log.warn({ err }, 'n8n chat failed');
      return sendError(reply, 502, 'ASSISTANT_UNAVAILABLE', 'The assistant is unavailable. Please try again.');
    }
    const latencyMs = Math.round(performance.now() - started);

    // 4. success
    const category = isCategory(result.category) ? result.category : 'Other';
    const answered = Boolean(result.answered);
    const updatedUser = (await updateMessageClassification(userRow.id, category, answered)) ?? {
      ...userRow,
      category,
      answered,
    };
    const assistantRow = await insertMessage({
      sessionId: id,
      role: 'assistant',
      content: result.answer,
      category,
      answered,
      sources: result.sources ?? [],
      latencyMs,
    });
    await touchSession(id);
    emitStatsChanged();

    return reply.code(200).send({
      userMessage: toMessageDto(updatedUser),
      assistantMessage: toMessageDto(assistantRow),
      offerContactForm: !answered,
    });
  });
};
