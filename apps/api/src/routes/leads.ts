import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { emitStatsChanged } from '../lib/events.js';
import { getSession, insertLead, listMessages, updateLeadEmail } from '../db/queries.js';
import { sendError, summarizeIssues, type RouteDeps } from './sessions.js';

const leadBodySchema = z.object({
  sessionId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(50),
  email: z.email(),
  unansweredQuestion: z.string().max(2000).optional(),
});

export const registerLeadRoutes: FastifyPluginAsync<RouteDeps> = async (app, { n8n }) => {
  app.post('/api/leads', async (request, reply) => {
    const parsed = leadBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, 400, 'VALIDATION_ERROR', summarizeIssues(parsed.error));
    }
    const { sessionId, name, phone, email, unansweredQuestion } = parsed.data;

    const session = await getSession(sessionId);
    if (!session) return sendError(reply, 404, 'SESSION_NOT_FOUND', 'Session not found');

    const lead = await insertLead({ sessionId, name, phone, email, unansweredQuestion: unansweredQuestion ?? null });
    emitStatsChanged();

    let emailStatus: 'sent' | 'failed' = 'failed';
    let summary: string | null = null;
    try {
      const messages = await listMessages(sessionId);
      const result = await n8n.lead({
        lead: { name, phone, email },
        session_id: sessionId,
        unanswered_question: unansweredQuestion ?? null,
        transcript: messages.map((m) => ({ role: m.role, content: m.content, created_at: m.createdAt })),
      });
      await updateLeadEmail(lead.id, 'sent', result.email_id, result.summary);
      emailStatus = 'sent';
      summary = result.summary;
    } catch (err) {
      request.log.warn({ err, leadId: lead.id }, 'lead email failed');
      try {
        await updateLeadEmail(lead.id, 'failed', null, null);
      } catch (updateErr) {
        request.log.warn({ err: updateErr, leadId: lead.id }, 'could not record lead email failure');
      }
    }
    emitStatsChanged();

    return reply.code(201).send({ id: lead.id, emailStatus, ...(summary ? { summary } : {}) });
  });
};
