import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { CANNED_FALLBACK, CATEGORIES, CHECKIN_Q, HELIPAD_Q, REVIEWER_RE, SAMPLE_PDF, isMockMode } from '../support';

// End-to-end HTTP contract (ARCHITECTURE §8), run against the stack through nginx.
// Mock mode (N8N_MOCK=1) relaxes content assertions; real mode sends ONE real lead email to LEAD_TO.
test.describe.configure({ mode: 'serial' });

let mock = true;
let sessionId = '';

test.beforeAll(async ({ request }) => {
  mock = await isMockMode(request);
});

test('health: db up', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, db: 'up' });
  if (!mock) expect(body.n8n).toBe('up');
});

test('upload: sample PDF becomes the ready document', async ({ request }) => {
  test.setTimeout(200_000);
  const res = await request.post('/api/admin/document', {
    multipart: {
      file: { name: 'cincinnati-hotel.pdf', mimeType: 'application/pdf', buffer: await readFile(SAMPLE_PDF) },
    },
  });
  // 202: validated and stored; ingest runs in the background and is reported through the stats.
  expect(res.status(), await res.text()).toBe(202);
  const { document: accepted } = await res.json();
  expect(accepted.status).toBe('processing');

  type Doc = { id: string; status: string; chunkCount: number | null };
  const seen: { doc: Doc | null } = { doc: null };
  await expect
    .poll(
      async () => {
        const stats = await (await request.get('/api/admin/stats')).json();
        expect(stats.pendingDocument?.status, stats.pendingDocument?.error ?? '').not.toBe('failed');
        const doc = stats.activeDocument as Doc | null;
        seen.doc = doc;
        return doc && doc.id === accepted.id ? doc.status : 'processing';
      },
      { timeout: 190_000, intervals: [500, 1000, 2000] },
    )
    .toBe('ready');
  if (mock) expect(seen.doc?.chunkCount).toBe(42);
  else expect(seen.doc?.chunkCount).toBeGreaterThan(10);
});

test('chat: answerable and unanswerable questions', async ({ request }) => {
  test.setTimeout(90_000);
  const session = await request.post('/api/sessions', { data: {} });
  expect(session.status()).toBe(201);
  sessionId = (await session.json()).id;
  expect(sessionId).toBeTruthy();

  const answered = await request.post(`/api/sessions/${sessionId}/messages`, { data: { content: CHECKIN_Q } });
  expect(answered.status(), await answered.text()).toBe(200);
  const a = await answered.json();
  expect(a.assistantMessage.answered).toBe(true);
  expect(a.offerContactForm).toBe(false);
  expect(CATEGORIES).toContain(a.assistantMessage.category);
  if (!mock) {
    expect(a.assistantMessage.content).toContain('3');
    expect(['Pricing & Booking', 'Policies']).toContain(a.assistantMessage.category);
  }

  const unanswered = await request.post(`/api/sessions/${sessionId}/messages`, { data: { content: HELIPAD_Q } });
  expect(unanswered.status(), await unanswered.text()).toBe(200);
  const u = await unanswered.json();
  expect(u.assistantMessage.answered).toBe(false);
  expect(u.offerContactForm).toBe(true);
  expect(u.assistantMessage.content).toBe(CANNED_FALLBACK);
});

test('chat: error envelope for a missing session and an empty message', async ({ request }) => {
  const missing = await request.post('/api/sessions/00000000-0000-4000-8000-000000000000/messages', {
    data: { content: CHECKIN_Q },
  });
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe('SESSION_NOT_FOUND');

  const empty = await request.post(`/api/sessions/${sessionId}/messages`, { data: { content: '  ' } });
  expect(empty.status()).toBe(400);
  expect((await empty.json()).error.code).toBe('VALIDATION_ERROR');
});

test('lead: contact form is stored and emailed', async ({ request }) => {
  test.setTimeout(100_000);
  test.skip(!mock && REVIEWER_RE.test(process.env.LEAD_TO ?? ''), 'LEAD_TO contains a reviewer address');
  const res = await request.post('/api/leads', {
    data: {
      sessionId,
      name: 'E2E Test',
      phone: '+1 513 555 0100',
      email: 'e2e@example.com',
      unansweredQuestion: HELIPAD_Q,
    },
    timeout: 90_000,
  });
  expect(res.status(), await res.text()).toBe(201);
  expect((await res.json()).emailStatus).toBe('sent');
});

test('stats: counters and all 8 categories', async ({ request }) => {
  const res = await request.get('/api/admin/stats');
  expect(res.status()).toBe(200);
  const stats = await res.json();
  expect(stats.totalSessions).toBeGreaterThanOrEqual(1);
  expect(stats.totalQuestions).toBeGreaterThanOrEqual(2);
  expect(stats.unansweredQuestions).toBeGreaterThanOrEqual(1);
  expect(stats.totalLeads).toBeGreaterThanOrEqual(1);
  expect(stats.byCategory).toHaveLength(CATEGORIES.length);
});

test('sse: stats stream sends an event with unbuffered headers', async ({ baseURL }) => {
  // APIRequestContext waits for the whole body, which never ends on a stream, so read it with fetch.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(`${baseURL}/api/admin/stats/stream`, { signal: ctrl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');

    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let seen = '';
    while (!seen.includes('event: stats')) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += value;
    }
    expect(seen).toContain(': ping');
    expect(seen).toContain('event: stats');
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
});
