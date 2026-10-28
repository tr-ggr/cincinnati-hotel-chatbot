import type { Config } from '../config.js';
import { CANNED_FALLBACK, type Category } from './categories.js';

export interface N8nClient {
  ingest(input: { document_id: string; filename: string; file_url: string }): Promise<{ ok: true; document_id: string; chunk_count: number }>;
  chat(input: { session_id: string; message_id: string; question: string; document_id: string; history: { role: 'user' | 'assistant'; content: string }[] })
    : Promise<{ answer: string; category: Category; answered: boolean; sources: { chunk_index: number; score: number }[]; model: string }>;
  lead(input: { lead: { name: string; phone: string; email: string }; session_id: string; unanswered_question: string | null; transcript: { role: string; content: string; created_at: string }[] })
    : Promise<{ ok: true; email_id: string | null; summary: string | null }>;
}

export type N8nErrorCode = 'NOT_IMPLEMENTED' | 'TIMEOUT' | 'UNAVAILABLE' | 'BAD_RESPONSE';

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

function notImplemented(): never {
  throw new N8nError('NOT_IMPLEMENTED', 'n8n HTTP client not implemented yet (S2-04); set N8N_MOCK=1');
}

/** Returns the mock when config.n8nMock, else a stub throwing N8nError('NOT_IMPLEMENTED') (S2-04 replaces it). */
export function createN8nClient(config: Pick<Config, 'n8nMock' | 'n8nBaseUrl' | 'n8nWebhookSecret'>): N8nClient {
  if (config.n8nMock) return createMockN8nClient();
  return {
    async ingest() {
      return notImplemented();
    },
    async chat() {
      return notImplemented();
    },
    async lead() {
      return notImplemented();
    },
  };
}
