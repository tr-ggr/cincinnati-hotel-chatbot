import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import type { DocumentRow, MessageRow } from '../src/db/queries.js';
import { CANNED_FALLBACK } from '../src/lib/categories.js';

// Route tests through the real Fastify app (N8N_MOCK client) with the database layer mocked out.
vi.mock('../src/db/pool.js', () => ({
  getPool: vi.fn(),
  closePool: vi.fn(async () => {}),
  query: vi.fn(async () => ({ rows: [] })),
  withTransaction: vi.fn(),
}));

vi.mock('../src/db/queries.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/db/queries.js')>();
  return {
    toMessageDto: real.toMessageDto,
    toDocumentInfo: real.toDocumentInfo,
    createSession: vi.fn(),
    getSession: vi.fn(),
    touchSession: vi.fn(async () => {}),
    listMessages: vi.fn(async () => []),
    listRecentMessages: vi.fn(async () => []),
    insertMessage: vi.fn(),
    updateMessageClassification: vi.fn(async () => null),
    insertLead: vi.fn(),
    updateLeadEmail: vi.fn(async () => null),
    insertDocument: vi.fn(),
    activateDocument: vi.fn(),
    failDocument: vi.fn(),
    getActiveDocument: vi.fn(async () => null),
    getDocument: vi.fn(async () => null),
    getStatsOverview: vi.fn(),
  };
});

const { buildApp } = await import('../src/app.js');
const db = vi.mocked(await import('../src/db/queries.js'));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-10-29T00:00:00.000Z';

const config: Config = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'postgres://unused',
  n8nBaseUrl: 'http://n8n:5678',
  n8nWebhookSecret: 's3cret',
  n8nMock: true,
  internalBaseUrl: 'http://api:3000',
  uploadDir: mkdtempSync(path.join(tmpdir(), 'hotel-api-test-')),
  maxUploadMb: 1,
  maxUploadBytes: 1024 * 1024,
};

const readyDoc: DocumentRow = {
  id: '22222222-2222-4222-8222-222222222222',
  filename: 'hotel.pdf',
  sizeBytes: 1000,
  pageCount: 3,
  chunkCount: 42,
  status: 'ready',
  error: null,
  uploadedAt: NOW,
  readyAt: NOW,
  isActive: true,
};

let seq = 0;
function messageRow(input: Partial<MessageRow> & Pick<MessageRow, 'role' | 'content'>): MessageRow {
  return {
    id: `33333333-3333-4333-8333-${String(++seq).padStart(12, '0')}`,
    sessionId: SESSION_ID,
    category: null,
    answered: null,
    latencyMs: null,
    createdAt: NOW,
    ...input,
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(config);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  db.getSession.mockResolvedValue({ id: SESSION_ID, startedAt: NOW, lastActivityAt: NOW, userAgent: null });
  db.getActiveDocument.mockResolvedValue(readyDoc);
  db.insertMessage.mockImplementation(async (input) =>
    messageRow({
      role: input.role,
      content: input.content,
      category: input.category ?? null,
      answered: input.answered ?? null,
      ...(input.sources ? { sources: input.sources } : {}),
    }),
  );
});

describe('health', () => {
  it('reports db up and mock n8n', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: 'up', n8n: 'mock', activeDocument: true });
  });
});

describe('error envelope', () => {
  it('returns NOT_FOUND for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  it('echoes a safe x-request-id and replaces an unsafe one', async () => {
    const ok = await app.inject({ method: 'GET', url: '/api/nope', headers: { 'x-request-id': 'abc-123' } });
    expect(ok.headers['x-request-id']).toBe('abc-123');
    const bad = await app.inject({ method: 'GET', url: '/api/nope', headers: { 'x-request-id': 'a b\nc' } });
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('sessions', () => {
  it('creates a session', async () => {
    db.createSession.mockResolvedValue({ id: SESSION_ID, startedAt: NOW, lastActivityAt: NOW, userAgent: 'vitest' });
    const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: SESSION_ID, startedAt: NOW });
  });

  it('rejects an empty message', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${SESSION_ID}/messages`, payload: { content: ' ' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns SESSION_NOT_FOUND for a malformed id', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/sessions/not-a-uuid/messages', payload: { content: 'hi' } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns NO_DOCUMENT when no ready document is active', async () => {
    db.getActiveDocument.mockResolvedValue({ ...readyDoc, status: 'processing' });
    const res = await app.inject({ method: 'POST', url: `/api/sessions/${SESSION_ID}/messages`, payload: { content: 'hi' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NO_DOCUMENT');
  });

  it('answers a question', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/messages`,
      payload: { content: 'What time is check-in?' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offerContactForm).toBe(false);
    expect(body.userMessage).toMatchObject({ role: 'user', category: 'Pricing & Booking', answered: true });
    expect(body.assistantMessage).toMatchObject({ role: 'assistant', answered: true });
    expect(body.assistantMessage).not.toHaveProperty('sessionId');
  });

  it('offers the contact form on the canned fallback', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/messages`,
      payload: { content: 'Is there a helipad on the roof?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      offerContactForm: true,
      assistantMessage: { content: CANNED_FALLBACK, answered: false },
    });
  });
});

describe('leads', () => {
  it('validates the body', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/leads', payload: { sessionId: SESSION_ID, email: 'nope' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('stores the lead and reports the email as sent', async () => {
    db.insertLead.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      sessionId: SESSION_ID,
      name: 'Jane',
      phone: '1',
      email: 'jane@example.com',
      unansweredQuestion: null,
      emailStatus: 'pending',
      emailId: null,
      summary: null,
      createdAt: NOW,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/leads',
      payload: { sessionId: SESSION_ID, name: 'Jane', phone: '1', email: 'jane@example.com' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ emailStatus: 'sent', summary: 'mock summary' });
    expect(db.updateLeadEmail).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444', 'sent', 'mock', 'mock summary');
  });
});

describe('internal', () => {
  const url = `/internal/documents/${readyDoc.id}/file`;

  it('rejects requests without the shared secret', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns NOT_FOUND for an unknown document with the right secret', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { 'x-hotel-secret': 's3cret' } });
    expect(res.statusCode).toBe(404);
  });
});
