import { z } from 'zod';
import type { Config } from '../config.js';
import { CANNED_FALLBACK, isCategory, type Category } from './categories.js';

export interface N8nClient {
  ingest(input: { document_id: string; filename: string; file_url: string }): Promise<{ ok: true; document_id: string; chunk_count: number }>;
  chat(input: { session_id: string; message_id: string; question: string; document_id: string; history: { role: 'user' | 'assistant'; content: string }[] })
    : Promise<{ answer: string; category: Category; answered: boolean; sources: { chunk_index: number; score: number }[]; model: string }>;
  lead(input: { lead: { name: string; phone: string; email: string }; session_id: string; unanswered_question: string | null; transcript: { role: string; content: string; created_at: string }[] })
    : Promise<{ ok: true; email_id: string | null; summary: string | null }>;
}

export type N8nErrorCode =
  | 'NOT_IMPLEMENTED'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'BAD_RESPONSE'
  | 'INGEST_FAILED'
  | 'ASSISTANT_UNAVAILABLE'
  | 'LEAD_EMAIL_FAILED';

export class N8nError extends Error {
  readonly code: N8nErrorCode;
  constructor(code: N8nErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'N8nError';
    this.code = code;
  }
}

const KEYWORDS: [RegExp, Category][] = [
  [/room/, 'Rooms'],
  [/restaurant|breakfast/, 'Restaurant & Dining'],
  [/pool|gym|spa|wifi/, 'Amenities & Facilities'],
  [/price|rate|book|cancel|check/, 'Pricing & Booking'],
  [/airport|shuttle|parking/, 'Location & Transport'],
  [/pet|smok/, 'Policies'],
  [/wedding|event|ballroom/, 'Events'],
];

export function mockCategory(question: string): Category {
  const q = question.toLowerCase();
  return KEYWORDS.find(([re]) => re.test(q))?.[1] ?? 'Other';
}

export function createMockN8nClient(): N8nClient {
  return {
    async ingest(input) {
      return { ok: true, document_id: input.document_id, chunk_count: 42 };
    },
    async chat(input) {
      const category = mockCategory(input.question);
      if (/helipad/i.test(input.question)) {
        return { answer: CANNED_FALLBACK, category, answered: false, sources: [], model: 'mock' };
      }
      return {
        answer: `[mock] Here is some information about ${category.toLowerCase()}.`,
        category,
        answered: true,
        sources: [{ chunk_index: 0, score: 0.9 }],
        model: 'mock',
      };
    },
    async lead() {
      return { ok: true, email_id: 'mock', summary: 'mock summary' };
    },
  };
}

const ingestSchema = z.object({
  ok: z.literal(true),
  document_id: z.string().min(1),
  chunk_count: z.coerce.number().int().positive(),
});

const chatSchema = z.object({
  answer: z.string(),
  category: z.unknown().transform((v): Category => (isCategory(v) ? v : 'Other')),
  answered: z.boolean(),
  sources: z
    .array(z.object({ chunk_index: z.coerce.number(), score: z.coerce.number() }))
    .nullish()
    .transform((v) => v ?? []),
  model: z
    .string()
    .nullish()
    .transform((v) => v || 'gpt-4.1-mini'),
});

const leadSchema = z.object({
  ok: z.literal(true),
  email_id: z.string().nullish().transform((v) => v ?? null),
  summary: z.string().nullish().transform((v) => v ?? null),
});

type Endpoint = 'ingest' | 'chat' | 'lead';

const ENDPOINTS: Record<Endpoint, { code: N8nErrorCode; timeoutMs: number }> = {
  ingest: { code: 'INGEST_FAILED', timeoutMs: 180_000 },
  chat: { code: 'ASSISTANT_UNAVAILABLE', timeoutMs: 45_000 },
  lead: { code: 'LEAD_EMAIL_FAILED', timeoutMs: 30_000 },
};

function excerpt(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function createHttpN8nClient(config: Pick<Config, 'n8nBaseUrl' | 'n8nWebhookSecret'>): N8nClient {
  const base = config.n8nBaseUrl.replace(/\/+$/, '');

  async function call<S extends z.ZodType>(endpoint: Endpoint, body: unknown, schema: S): Promise<z.output<S>> {
    const { code, timeoutMs } = ENDPOINTS[endpoint];
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${base}/webhook/hotel/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hotel-secret': config.n8nWebhookSecret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new N8nError(code, `n8n ${endpoint} timed out after ${timeoutMs} ms`, { cause: err });
      }
      const reason = err instanceof Error ? err.message : 'unknown error';
      throw new N8nError(code, `n8n ${endpoint} request failed: ${reason}`, { cause: err });
    }
    if (!res.ok) {
      throw new N8nError(code, `n8n ${endpoint} returned HTTP ${res.status}: ${excerpt(text)}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new N8nError(code, `n8n ${endpoint} returned invalid JSON (HTTP ${res.status}): ${excerpt(text)}`, {
        cause: err,
      });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new N8nError(
        code,
        `n8n ${endpoint} response failed validation (HTTP ${res.status}): ${excerpt(issues)}; body: ${excerpt(text)}`,
      );
    }
    return parsed.data;
  }

  return {
    ingest: (input) => call('ingest', input, ingestSchema),
    chat: (input) => call('chat', input, chatSchema),
    lead: (input) => call('lead', input, leadSchema),
  };
}

/** Returns the mock when config.n8nMock, else the real HTTP client for the n8n webhooks. */
export function createN8nClient(config: Pick<Config, 'n8nMock' | 'n8nBaseUrl' | 'n8nWebhookSecret'>): N8nClient {
  if (config.n8nMock) return createMockN8nClient();
  return createHttpN8nClient(config);
}
