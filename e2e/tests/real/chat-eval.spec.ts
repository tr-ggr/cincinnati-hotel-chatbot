import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { CANNED_FALLBACK, N8N_URL, SAMPLE_QUESTIONS, isMockMode } from '../support';

// WF2 (hotel/chat) evaluation straight against the n8n webhook, bypassing the API (accuracy set, docs/sample/questions.json).
// Prints a per-question table and the best_score distribution (cosine DISTANCE, lower = better).
const CHAT_URL = `${N8N_URL}/webhook/hotel/chat`;

interface ChatReply {
  answer: string;
  category: string;
  answered: boolean;
  sources?: { chunk_index: number; score: number }[];
}

interface SampleQuestion {
  question: string;
  /** Expected `answered` from the webhook (a partial answer is answered=false: the API then offers the contact form). */
  answered: boolean;
  category: string;
  /** "canned": the answer is exactly the canned sentence. "partial": covered part + the canned sentence. */
  expect?: 'canned' | 'partial';
  /** Regex (case-insensitive) the answer must match, e.g. the in-PDF fact of a partial answer. */
  answerMatches?: string;
}

const QUESTIONS = JSON.parse(readFileSync(SAMPLE_QUESTIONS, 'utf8')) as SampleQuestion[];
// Allow one miss across the whole set (≥ 9/10 on the original ten questions).
const MIN_MATCHES = QUESTIONS.length - 1;

let documentId = '';

function ask(request: APIRequestContext, question: string, docId: string) {
  return request.post(CHAT_URL, {
    headers: { 'x-hotel-secret': process.env.N8N_WEBHOOK_SECRET ?? '' },
    data: {
      session_id: '00000000-0000-4000-8000-0000000e7a11',
      message_id: '00000000-0000-4000-8000-0000000e7a12',
      question,
      document_id: docId,
      history: [],
    },
    timeout: 40_000,
  });
}

async function askOk(request: APIRequestContext, question: string): Promise<ChatReply> {
  const res = await ask(request, question, documentId);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as ChatReply;
}

test.beforeAll(async ({ request }) => {
  test.skip(await isMockMode(request), 'API is in mock mode (N8N_MOCK=1)');
  test.skip(!process.env.N8N_WEBHOOK_SECRET, 'N8N_WEBHOOK_SECRET is empty in .env');
  const res = await request.get('/api/admin/document');
  const { document } = await res.json();
  expect(document?.status, 'no ready document (the api project uploads one)').toBe('ready');
  documentId = document.id;
});

test('webhook rejects requests without the secret', async ({ request }) => {
  const res = await request.post(CHAT_URL, { data: {} });
  expect([401, 403], `HTTP ${res.status()} — 404 means the workflow is not imported (pnpm n8n:import)`).toContain(
    res.status(),
  );
});

test(`sample questions: at least ${MIN_MATCHES}/${QUESTIONS.length} answered flags match`, async ({ request }) => {
  test.setTimeout(QUESTIONS.length * 45_000);
  const rows: Record<string, unknown>[] = [];
  const scores = { answered: [] as number[], unanswered: [] as number[] };
  let matches = 0;
  for (const q of QUESTIONS) {
    const res = await ask(request, q.question, documentId);
    if (res.status() !== 200) {
      rows.push({ question: q.question, expected: q.answered, got: `HTTP ${res.status()}` });
      continue;
    }
    const body = (await res.json()) as ChatReply;
    const best = Math.min(...(body.sources ?? []).map((s) => s.score));
    if (Number.isFinite(best)) scores[q.answered ? 'answered' : 'unanswered'].push(best);
    if (body.answered === q.answered) matches++;
    rows.push({
      question: q.question,
      expected: q.answered,
      got: body.answered,
      category: `${body.category} (${q.category})`,
      best_score: Number.isFinite(best) ? best.toFixed(3) : 'n/a',
    });
  }
  console.table(rows);
  console.log('best_score expected answered:  ', scores.answered.sort((a, b) => a - b).join(' ') || '(none)');
  console.log('best_score expected unanswered:', scores.unanswered.sort((a, b) => a - b).join(' ') || '(none)');
  expect(matches).toBeGreaterThanOrEqual(MIN_MATCHES);
});

// Off-topic and prompt-injection questions must get exactly the canned sentence (WF2 system message rules).
for (const q of QUESTIONS.filter((x) => x.expect === 'canned')) {
  test(`off-topic: "${q.question}" gets exactly the canned sentence`, async ({ request }) => {
    expect(await askOk(request, q.question)).toMatchObject({ answered: false, answer: CANNED_FALLBACK });
  });
}

// Multi-part question, one part in the PDF: the covered fact, then the canned sentence; answered=false.
for (const q of QUESTIONS.filter((x) => x.expect === 'partial')) {
  test(`partial: "${q.question}" answers the covered part and adds the canned sentence`, async ({ request }) => {
    const body = await askOk(request, q.question);
    expect(body.answered).toBe(false);
    expect(body.answer).toContain(CANNED_FALLBACK);
    expect(body.answer.length).toBeGreaterThan(CANNED_FALLBACK.length);
    if (q.answerMatches) expect(body.answer).toMatch(new RegExp(q.answerMatches, 'i'));
  });

  test(`partial through the API: "${q.question}" offers the contact form`, async ({ request }) => {
    test.setTimeout(90_000);
    const session = await request.post('/api/sessions', { data: {} });
    expect(session.status()).toBe(201);
    const { id } = await session.json();
    const res = await request.post(`/api/sessions/${id}/messages`, { data: { content: q.question } });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.offerContactForm).toBe(true);
    expect(body.assistantMessage.answered).toBe(false);
    expect(body.assistantMessage.content).toContain(CANNED_FALLBACK);
    expect(body.assistantMessage.content.length).toBeGreaterThan(CANNED_FALLBACK.length);
    if (q.answerMatches) expect(body.assistantMessage.content).toMatch(new RegExp(q.answerMatches, 'i'));
  });
}

test('greeting is answered as small talk with category Other', async ({ request }) => {
  const res = await ask(request, 'hi there!', documentId);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ answered: true, category: 'Other' });
});

test('unknown document id falls back to the canned sentence', async ({ request }) => {
  const res = await ask(request, 'What time is check-in?', randomUUID());
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ answered: false, answer: CANNED_FALLBACK });
});
