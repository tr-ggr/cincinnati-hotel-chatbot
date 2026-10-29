import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANNED_FALLBACK } from '../src/lib/categories.js';
import { createN8nClient, mockCategory, N8nError } from '../src/lib/n8n.js';

const config = { n8nMock: false, n8nBaseUrl: 'http://n8n:5678/', n8nWebhookSecret: 's3cret' };
const chatInput = {
  session_id: 's',
  message_id: 'm',
  question: 'What time is check-in?',
  document_id: 'd',
  history: [],
};

function stubFetch(status: number, body: string) {
  const fn = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mock client', () => {
  const n8n = createN8nClient({ ...config, n8nMock: true });

  it('classifies by keyword', () => {
    expect(mockCategory('Is breakfast included?')).toBe('Restaurant & Dining');
    expect(mockCategory('Can I bring my pet?')).toBe('Policies');
    expect(mockCategory('hello')).toBe('Other');
  });

  it('answers normal questions and falls back on the helipad question', async () => {
    expect(await n8n.chat(chatInput)).toMatchObject({ answered: true, category: 'Pricing & Booking' });
    expect(await n8n.chat({ ...chatInput, question: 'Is there a helipad?' })).toMatchObject({
      answered: false,
      answer: CANNED_FALLBACK,
    });
  });

  it('ingests 42 chunks', async () => {
    expect(await n8n.ingest({ document_id: 'd', filename: 'f.pdf', file_url: 'x' })).toMatchObject({ chunk_count: 42 });
  });
});

describe('http client', () => {
  const n8n = createN8nClient(config);

  it('posts to the webhook with the secret header', async () => {
    const fetch = stubFetch(200, JSON.stringify({ answer: 'At 3 PM.', category: 'Policies', answered: true }));
    const res = await n8n.chat(chatInput);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://n8n:5678/webhook/hotel/chat');
    expect((init.headers as Record<string, string>)['x-hotel-secret']).toBe('s3cret');
    expect(JSON.parse(init.body as string)).toEqual(chatInput);
    expect(res).toEqual({ answer: 'At 3 PM.', category: 'Policies', answered: true, sources: [], model: 'gpt-4.1-mini' });
  });

  it('coerces an unknown category to Other', async () => {
    stubFetch(200, JSON.stringify({ answer: 'x', category: 'Spa', answered: true }));
    expect((await n8n.chat(chatInput)).category).toBe('Other');
  });

  it.each([
    [500, 'boom', /HTTP 500/],
    [200, 'not json', /invalid JSON/],
    [200, JSON.stringify({ answer: 1 }), /failed validation/],
  ])('maps HTTP %i "%s" to N8nError', async (status, body, message) => {
    stubFetch(status, body);
    const err = await n8n.chat(chatInput).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(N8nError);
    expect((err as N8nError).code).toBe('ASSISTANT_UNAVAILABLE');
    expect((err as N8nError).message).toMatch(message);
  });

  it('uses the endpoint-specific error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const err = await n8n.lead({ lead: { name: 'a', phone: 'b', email: 'c' }, session_id: 's', unanswered_question: null, transcript: [] }).catch((e: unknown) => e);
    expect((err as N8nError).code).toBe('LEAD_EMAIL_FAILED');
  });
});
