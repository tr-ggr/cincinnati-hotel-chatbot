import type { PoolClient } from 'pg';
import { query, withTransaction } from './pool.js';
import { isCategory, type Category } from '../lib/categories.js';

// ---------- DTO types ----------

export interface SessionRow {
  id: string;
  startedAt: string;
  lastActivityAt: string;
  userAgent: string | null;
}

export type Role = 'user' | 'assistant';

export interface Source {
  chunk_index: number;
  score: number;
}

/** Message DTO per ARCHITECTURE section 4. `sources` only present on assistant messages. */
export interface Message {
  id: string;
  role: Role;
  content: string;
  category: Category | null;
  answered: boolean | null;
  sources?: Source[];
  createdAt: string;
}
export type MessageDto = Message;

/** Full DB row (superset of Message). Use toMessageDto() before sending to clients. */
export interface MessageRow extends Message {
  sessionId: string;
  latencyMs: number | null;
}

export type EmailStatus = 'pending' | 'sent' | 'failed';

export interface LeadRow {
  id: string;
  sessionId: string | null;
  name: string;
  phone: string;
  email: string;
  unansweredQuestion: string | null;
  emailStatus: EmailStatus;
  emailId: string | null;
  summary: string | null;
  createdAt: string;
}

export type DocumentStatus = 'processing' | 'ready' | 'failed';

/** Same shape as GET /api/admin/document `document`. */
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

export interface DocumentRow extends DocumentInfo {
  isActive: boolean;
}

export interface StatsOverview {
  totalSessions: number;
  totalQuestions: number;
  unansweredQuestions: number;
  totalLeads: number;
  byCategory: { category: Category; count: number }[];
}

// ---------- row mappers ----------

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
const isoOrNull = (v: Date | string | null): string | null => (v == null ? null : iso(v));

interface SessionDbRow {
  id: string;
  started_at: Date;
  last_activity_at: Date;
  user_agent: string | null;
}
const mapSession = (r: SessionDbRow): SessionRow => ({
  id: r.id,
  startedAt: iso(r.started_at),
  lastActivityAt: iso(r.last_activity_at),
  userAgent: r.user_agent,
});

interface MessageDbRow {
  id: string;
  session_id: string;
  role: Role;
  content: string;
  category: string | null;
  answered: boolean | null;
  sources: Source[] | null;
  latency_ms: number | null;
  created_at: Date;
}
const mapMessage = (r: MessageDbRow): MessageRow => {
  const m: MessageRow = {
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    category: isCategory(r.category) ? r.category : null,
    answered: r.answered,
    latencyMs: r.latency_ms,
    createdAt: iso(r.created_at),
  };
  if (r.sources) m.sources = r.sources;
  return m;
};

/** Strips internal fields (sessionId, latencyMs) down to the section 4 Message DTO. */
export function toMessageDto(m: MessageRow): Message {
  const dto: Message = {
    id: m.id,
    role: m.role,
    content: m.content,
    category: m.category,
    answered: m.answered,
    createdAt: m.createdAt,
  };
  if (m.sources) dto.sources = m.sources;
  return dto;
}

interface LeadDbRow {
  id: string;
  session_id: string | null;
  name: string;
  phone: string;
  email: string;
  unanswered_question: string | null;
  email_status: EmailStatus;
  email_id: string | null;
  summary: string | null;
  created_at: Date;
}
const mapLead = (r: LeadDbRow): LeadRow => ({
  id: r.id,
  sessionId: r.session_id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  unansweredQuestion: r.unanswered_question,
  emailStatus: r.email_status,
  emailId: r.email_id,
  summary: r.summary,
  createdAt: iso(r.created_at),
});

interface DocumentDbRow {
  id: string;
  filename: string;
  size_bytes: number;
  page_count: number | null;
  chunk_count: number | null;
  status: DocumentStatus;
  error: string | null;
  is_active: boolean;
  uploaded_at: Date;
  ready_at: Date | null;
}
const mapDocument = (r: DocumentDbRow): DocumentRow => ({
  id: r.id,
  filename: r.filename,
  sizeBytes: r.size_bytes,
  pageCount: r.page_count,
  chunkCount: r.chunk_count,
  status: r.status,
  error: r.error,
  uploadedAt: iso(r.uploaded_at),
  readyAt: isoOrNull(r.ready_at),
  isActive: r.is_active,
});

/** Drops `isActive` -> the public DocumentInfo shape. */
export function toDocumentInfo(d: DocumentRow): DocumentInfo {
  const { isActive: _isActive, ...info } = d;
  return info;
}

// ---------- sessions ----------

export async function createSession(userAgent: string | null): Promise<SessionRow> {
  const rows = await query<SessionDbRow>('INSERT INTO sessions (user_agent) VALUES ($1) RETURNING *', [
    userAgent,
  ]);
  return mapSession(rows[0]!);
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const rows = await query<SessionDbRow>('SELECT * FROM sessions WHERE id = $1', [id]);
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function touchSession(id: string): Promise<void> {
  await query('UPDATE sessions SET last_activity_at = now() WHERE id = $1', [id]);
}

// ---------- messages ----------

export async function listMessages(sessionId: string): Promise<MessageRow[]> {
  const rows = await query<MessageDbRow>(
    'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC',
    [sessionId],
  );
  return rows.map(mapMessage);
}

/**
 * Last `limit` messages, oldest-first. Pass `beforeMessageId` to only include messages
 * created strictly before that message (used to build WF2 `history` excluding the new question).
 */
export async function listRecentMessages(
  sessionId: string,
  limit = 8,
  beforeMessageId?: string,
): Promise<MessageRow[]> {
  const rows = await query<MessageDbRow>(
    `SELECT * FROM (
       SELECT * FROM messages
       WHERE session_id = $1
         AND ($3::uuid IS NULL OR created_at < (SELECT created_at FROM messages WHERE id = $3))
       ORDER BY created_at DESC, id DESC
       LIMIT $2
     ) t ORDER BY created_at ASC, id ASC`,
    [sessionId, limit, beforeMessageId ?? null],
  );
  return rows.map(mapMessage);
}

export interface InsertMessageInput {
  sessionId: string;
  role: Role;
  content: string;
  category?: Category | null;
  answered?: boolean | null;
  sources?: Source[] | null;
  latencyMs?: number | null;
}

export async function insertMessage(input: InsertMessageInput): Promise<MessageRow> {
  const rows = await query<MessageDbRow>(
    `INSERT INTO messages (session_id, role, content, category, answered, sources, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
    [
      input.sessionId,
      input.role,
      input.content,
      input.category ?? null,
      input.answered ?? null,
      input.sources ? JSON.stringify(input.sources) : null,
      input.latencyMs ?? null,
    ],
  );
  return mapMessage(rows[0]!);
}

export async function updateMessageClassification(
  id: string,
  category: Category,
  answered: boolean,
): Promise<MessageRow | null> {
  const rows = await query<MessageDbRow>(
    'UPDATE messages SET category = $2, answered = $3 WHERE id = $1 RETURNING *',
    [id, category, answered],
  );
  return rows[0] ? mapMessage(rows[0]) : null;
}

/** Removes a question whose answer never arrived (n8n failed), so a retry does not count it twice. */
export async function deleteMessage(id: string): Promise<void> {
  await query('DELETE FROM messages WHERE id = $1', [id]);
}

// ---------- leads ----------

export interface InsertLeadInput {
  sessionId: string | null;
  name: string;
  phone: string;
  email: string;
  unansweredQuestion?: string | null;
}

export async function insertLead(input: InsertLeadInput): Promise<LeadRow> {
  const rows = await query<LeadDbRow>(
    `INSERT INTO leads (session_id, name, phone, email, unanswered_question)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.sessionId, input.name, input.phone, input.email, input.unansweredQuestion ?? null],
  );
  return mapLead(rows[0]!);
}

export async function updateLeadEmail(
  id: string,
  status: EmailStatus,
  emailId: string | null,
  summary: string | null,
): Promise<LeadRow | null> {
  const rows = await query<LeadDbRow>(
    'UPDATE leads SET email_status = $2, email_id = $3, summary = $4 WHERE id = $1 RETURNING *',
    [id, status, emailId, summary],
  );
  return rows[0] ? mapLead(rows[0]) : null;
}

// ---------- documents ----------

export interface InsertDocumentInput {
  /** Optional pre-generated uuid (e.g. used as the on-disk file name). */
  id?: string;
  filename: string;
  sizeBytes: number;
  pageCount?: number | null;
}

/** Inserts a `processing`, inactive document. */
export async function insertDocument(input: InsertDocumentInput): Promise<DocumentRow> {
  const rows = await query<DocumentDbRow>(
    `INSERT INTO documents (id, filename, size_bytes, page_count)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4) RETURNING *`,
    [input.id ?? null, input.filename, input.sizeBytes, input.pageCount ?? null],
  );
  return mapDocument(rows[0]!);
}

/**
 * One transaction: deactivate all, activate `id` (status ready, chunk_count, ready_at) and delete every
 * chunk that belongs to another document. Purging here, not in n8n, means a failed or concurrent upload
 * can never empty the live knowledge base. Returns the activated document and the previously active one
 * (null if none / same id) so the caller can delete the old file.
 */
export async function activateDocument(
  id: string,
  chunkCount: number,
): Promise<{ document: DocumentRow; previous: DocumentRow | null }> {
  return withTransaction(async (client: PoolClient) => {
    const prev = await client.query<DocumentDbRow>('SELECT * FROM documents WHERE is_active');
    await client.query('UPDATE documents SET is_active = false WHERE is_active');
    const res = await client.query<DocumentDbRow>(
      `UPDATE documents SET is_active = true, status = 'ready', chunk_count = $2, ready_at = now(), error = NULL
       WHERE id = $1 RETURNING *`,
      [id, chunkCount],
    );
    if (!res.rows[0]) throw new Error(`Document ${id} not found`);
    await client.query("DELETE FROM chunks WHERE metadata->>'document_id' <> $1", [id]);
    const p = prev.rows[0];
    return { document: mapDocument(res.rows[0]), previous: p && p.id !== id ? mapDocument(p) : null };
  });
}

export async function failDocument(id: string, error: string): Promise<DocumentRow | null> {
  const rows = await query<DocumentDbRow>(
    "UPDATE documents SET status = 'failed', error = $2 WHERE id = $1 RETURNING *",
    [id, error],
  );
  return rows[0] ? mapDocument(rows[0]) : null;
}

/** At startup: an ingest cannot survive a restart, so any upload still `processing` has failed. */
export async function failInterruptedDocuments(): Promise<number> {
  const rows = await query<{ id: string }>(
    "UPDATE documents SET status = 'failed', error = 'Interrupted by a server restart. Please upload again.' WHERE status = 'processing' RETURNING id",
  );
  return rows.length;
}

/** Drops the chunks a failed ingest may have written before it stopped. */
export async function deleteChunksForDocument(id: string): Promise<void> {
  await query("DELETE FROM chunks WHERE metadata->>'document_id' = $1", [id]);
}

/**
 * The newest upload that is not active and was uploaded after the active one, while it is still
 * `processing` or has `failed`. Null once it becomes active, or when nothing newer exists.
 */
export async function getPendingDocument(): Promise<DocumentRow | null> {
  const rows = await query<DocumentDbRow>(
    `SELECT * FROM documents d
     WHERE NOT d.is_active AND d.status IN ('processing', 'failed')
       AND d.uploaded_at > COALESCE((SELECT uploaded_at FROM documents WHERE is_active), '-infinity')
     ORDER BY d.uploaded_at DESC LIMIT 1`,
  );
  return rows[0] ? mapDocument(rows[0]) : null;
}

/** The active document, or null. Callers needing "ready" should also check `status === 'ready'`. */
export async function getActiveDocument(): Promise<DocumentRow | null> {
  const rows = await query<DocumentDbRow>('SELECT * FROM documents WHERE is_active LIMIT 1');
  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const rows = await query<DocumentDbRow>('SELECT * FROM documents WHERE id = $1', [id]);
  return rows[0] ? mapDocument(rows[0]) : null;
}

// ---------- stats ----------

interface StatsDbRow {
  total_sessions: number;
  total_questions: number;
  unanswered_questions: number;
  total_leads: number;
  by_category: { category: string; count: number | string }[] | null;
}

/** Raw view read; `byCategory` only has categories with rows (lib/stats.ts zero-fills). */
export async function getStatsOverview(): Promise<StatsOverview> {
  const rows = await query<StatsDbRow>('SELECT * FROM stats_overview');
  const r = rows[0]!;
  return {
    totalSessions: r.total_sessions,
    totalQuestions: r.total_questions,
    unansweredQuestions: r.unanswered_questions,
    totalLeads: r.total_leads,
    byCategory: (r.by_category ?? [])
      .filter((c) => isCategory(c.category))
      .map((c) => ({ category: c.category as Category, count: Number(c.count) })),
  };
}
