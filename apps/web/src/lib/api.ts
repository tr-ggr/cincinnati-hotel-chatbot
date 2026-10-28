import type { Category } from './categories';

// ---------- types (mirror docs/ARCHITECTURE.md section 4) ----------

export interface Source {
  chunk_index: number;
  score: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  category: Category | null;
  answered: boolean | null;
  /** Only present on assistant messages. */
  sources?: Source[];
  createdAt: string;
}

export interface Session {
  id: string;
  startedAt: string;
}

export interface SessionWithMessages extends Session {
  messages: Message[];
}

export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage: Message;
  /** Always === !assistantMessage.answered */
  offerContactForm: boolean;
}

export interface LeadInput {
  sessionId: string;
  name: string;
  phone: string;
  email: string;
  unansweredQuestion?: string;
}

export interface LeadResponse {
  id: string;
  emailStatus: 'sent' | 'failed';
  summary?: string;
}

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface DocumentInfo {
  id: string;
  filename: string;
  sizeBytes: number;
  pageCount: number | null;
  chunkCount: number | null;
  status: DocumentStatus;
  error: string | null;
  uploadedAt: string;
  readyAt: string | null;
}

export interface CategoryCount {
  category: Category;
  count: number;
}

export interface StatsSnapshot {
  totalSessions: number;
  totalQuestions: number;
  unansweredQuestions: number;
  totalLeads: number;
  /** All 8 categories, zeros included, sorted desc by count. */
  byCategory: CategoryCount[];
  activeDocument: DocumentInfo | null;
  generatedAt: string;
}

export interface Health {
  ok: boolean;
  db: 'up' | 'down';
  n8n: 'up' | 'down' | 'mock';
  activeDocument: boolean;
}

// ---------- errors ----------

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

// ---------- client ----------

const BASE = '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      // non-JSON error body: keep fallbacks
    }
    throw new ApiError(res.status, code, message);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'The server returned an unexpected response.');
  }
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getHealth(): Promise<Health> {
  return request<Health>('/health');
}

/** Fastify rejects an empty JSON body, so we always send `{}`. */
export function createSession(): Promise<Session> {
  return postJson<Session>('/sessions', {});
}

export function getSession(id: string): Promise<SessionWithMessages> {
  return request<SessionWithMessages>(`/sessions/${encodeURIComponent(id)}`);
}

export function sendMessage(sessionId: string, content: string): Promise<SendMessageResponse> {
  return postJson<SendMessageResponse>(`/sessions/${encodeURIComponent(sessionId)}/messages`, { content });
}

export function createLead(input: LeadInput): Promise<LeadResponse> {
  return postJson<LeadResponse>('/leads', input);
}

/** Resolves to the active document, or null when none has been uploaded. */
export async function getDocument(): Promise<DocumentInfo | null> {
  const res = await request<{ document: DocumentInfo | null }>('/admin/document');
  return res.document;
}

/** Synchronous ingest (typically 10-30 s). Pass an AbortSignal to cancel. */
export async function uploadDocument(file: File, opts: { signal?: AbortSignal } = {}): Promise<DocumentInfo> {
  const form = new FormData();
  form.append('file', file);
  const res = await request<{ document: DocumentInfo }>('/admin/document', {
    method: 'POST',
    body: form,
    signal: opts.signal,
  });
  return res.document;
}

export function getStats(): Promise<StatsSnapshot> {
  return request<StatsSnapshot>('/admin/stats');
}

export const STATS_STREAM_URL = `${BASE}/admin/stats/stream`;
