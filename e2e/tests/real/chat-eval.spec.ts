import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { CANNED_FALLBACK, N8N_URL, SAMPLE_QUESTIONS, isMockMode } from '../support';

// WF2 (hotel/chat) evaluation straight against the n8n webhook, bypassing the API (accuracy set, docs/sample/questions.json).
// Prints a per-question table and the best_score distribution (cosine DISTANCE, lower = better).
const MIN_MATCHES = 9;
const CHAT_URL = `${N8N_URL}/webhook/hotel/chat`;

interface ChatReply {
  answer: string;
  category: string;
  answered: boolean;
  sources?: { chunk_index: number; score: number }[];
}

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

test(`sample questions: at least ${MIN_MATCHES}/10 answered flags match`, async ({ request }) => {
  test.setTimeout(10 * 45_000);
  const questions = JSON.parse(await readFile(SAMPLE_QUESTIONS, 'utf8')) as {
    question: string;
    answered: boolean;
    category: string;
  }[];
  const rows: Record<string, unknown>[] = [];
  const scores = { answered: [] as number[], unanswered: [] as number[] };
  let matches = 0;
  for (const q of questions) {
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
