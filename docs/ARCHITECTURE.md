# Architecture — Cincinnati Hotel Chatbot

> Source of truth for the build. Sprint cards in `sprints/` reference sections of this file by number (§).
> S4-03 refines this document (adds a Mermaid diagram, prose) but must not change contracts without updating code.

## §1 Overview and key decisions

```
Browser ──► cloudflared ──► nginx (apps/web, :80)  ──/api──► Fastify API (apps/api, :3000)
                     │                                            │        │
                     └──► n8n editor (n8n.<domain>)               │        └──► Postgres + pgvector (:5432)
                                                                  │
                                                  http://n8n:5678/webhook/hotel/* (internal, x-hotel-secret)
                                                                  │
                                                            n8n workflows ──► OpenAI (embeddings + chat)
                                                                           ──► Postgres (chunks via PGVector node)
                                                                           ──► Resend (lead email)
```

| Concern | Decision | Why |
|---|---|---|
| AI ownership | **n8n owns all AI**: ingest (load→split→embed→pgvector), chat (retrieve→grounded answer + category + `answered`), lead (summarize→email) | The task grades "orchestrated via n8n" and creative use of automation; every AI step is a visible node |
| App ownership | **Fastify 5 API** owns HTTP for the web app, file storage, persistence (documents/sessions/messages/leads), stats + SSE; calls n8n webhooks internally | Single writer → consistent stats, trivial SSE broadcast |
| Vectors | n8n **Postgres PGVector Store** node writes into a **pre-created** `chunks` table (LangChain layout) in the app DB | We control `vector(1536)` + HNSW index; node's `CREATE TABLE IF NOT EXISTS` no-ops |
| Chat transport | Request/response (no token streaming); optimistic UI + typing indicator | n8n webhooks don't stream |
| PDF → n8n | API stores the file; n8n downloads it from `http://api:3000/internal/documents/:id/file` (HTTP Request node, response = File) | Deterministic binary property, no multipart-to-webhook quirks |
| Categories | Fixed taxonomy of 8, classified in the same LLM call as the answer via Structured Output Parser | One LLM call per question; stats always consistent |
| Realtime stats | SSE `GET /api/admin/stats/stream` with 20 s heartbeat; EventSource auto-reconnect; 10 s polling fallback | Works through nginx + Cloudflare Tunnel |
| Shared code | None. The 8-category constant is duplicated in `apps/api` and `apps/web` | No monorepo build plumbing on a 1-day deadline |
| Public access | `cloudflared` container (token); hostnames `hotel.<domain>` → `web:80`, `n8n.<domain>` → `n8n:5678` | No TLS/Caddy; API reachable only via nginx `/api` |
| LLM models | `text-embedding-3-small` (1536 dims), `gpt-4.1-mini` temperature 0 | Cheap, fast, reliable JSON output |

The 8 categories (exact strings everywhere): `Rooms`, `Restaurant & Dining`, `Amenities & Facilities`, `Pricing & Booking`, `Location & Transport`, `Policies`, `Events`, `Other`.

Canned fallback sentence (exact): `I'm sorry, I don't have that information right now.`

## §2 Monorepo layout

```
TaugaAI/
├── .claude/CLAUDE.md
├── .env.example  .gitignore  .editorconfig  package.json  pnpm-workspace.yaml  README.md
├── apps/
│   ├── api/                          # Node 22 + Fastify 5 + TypeScript (ESM)
│   │   ├── Dockerfile                # node:22-alpine multi-stage (install → tsc → runtime)
│   │   ├── package.json  tsconfig.json
│   │   └── src/
│   │       ├── index.ts              # bootstrap, plugins (cors, multipart, rate-limit), route registration, graceful shutdown
│   │       ├── config.ts             # zod-validated env
│   │       ├── db/pool.ts            # pg Pool
│   │       ├── db/queries.ts         # ALL SQL as typed functions (no ORM)
│   │       ├── lib/categories.ts     # CATEGORIES const + Category type + isCategory()
│   │       ├── lib/events.ts         # EventEmitter: emit('stats:changed')
│   │       ├── lib/stats.ts          # getStats(): StatsSnapshot (reads stats_overview + active document)
│   │       ├── lib/n8n.ts            # n8n webhook client: ingest(), chat(), lead(); N8N_MOCK=1 → in-process mock
│   │       ├── lib/sse.ts            # sse(reply) helper: headers, send(event,data), heartbeat, cleanup on close
│   │       └── routes/
│   │           ├── health.ts         # GET /api/health
│   │           ├── sessions.ts       # POST /api/sessions, GET /api/sessions/:id, POST /api/sessions/:id/messages
│   │           ├── leads.ts          # POST /api/leads
│   │           ├── admin.ts          # GET/POST /api/admin/document, GET /api/admin/stats, GET /api/admin/stats/stream
│   │           └── internal.ts       # GET /internal/documents/:id/file (n8n only, x-hotel-secret)
│   └── web/                          # React 19 + Vite + TypeScript + Tailwind v4
│       ├── Dockerfile                # multi-stage → nginx:alpine
│       ├── nginx.conf                # SPA fallback + /api proxy (buffering off)
│       ├── index.html  package.json  vite.config.ts  tsconfig.json
│       └── src/
│           ├── main.tsx  App.tsx     # react-router: "/", "/chat", "/admin", "*"
│           ├── index.css             # tailwind import + design tokens
│           ├── lib/api.ts            # typed fetch client mirroring §4
│           ├── lib/categories.ts
│           ├── lib/useStatsStream.ts # SSE hook with polling fallback
│           ├── components/ui/        # Button, Card, Input, Badge, Spinner, Skeleton
│           ├── components/chat/      # MessageList, MessageBubble, Composer, TypingIndicator, ContactFormCard, SuggestionChips
│           ├── components/admin/     # UploadCard, StatCard, CategoryChart, LiveBadge
│           └── pages/                # Landing.tsx, Chat.tsx, Admin.tsx, NotFound.tsx
├── n8n/
│   ├── README.md                     # node-by-node explanation, credentials, import/export
│   ├── workflows/01-ingest-pdf.json  02-chat-answer.json  03-lead-email.json
│   ├── prompts/chat-system.md  lead-summary.md
│   └── credentials.template.json     # ${VAR} placeholders; never commit a filled copy
├── infra/
│   ├── docker-compose.yml  compose.override.yml
│   ├── db/00-create-n8n-db.sh  01-schema.sql
│   ├── cloudflared/README.md
│   └── scripts/n8n-import.sh  deploy.sh  smoke.sh
├── docs/  ARCHITECTURE.md  PDF-PROCESSING.md  ADMIN-DASHBOARD.md  RUNBOOK.md  SUBMISSION.md
│          screenshots/  sample/{generate-sample-pdf.ts, cincinnati-hotel.pdf, questions.json}
└── sprints/  README.md  STATUS.md  S0..S5-*.md
```

Packages
- api: `fastify@5`, `@fastify/multipart`, `@fastify/cors`, `@fastify/rate-limit`, `pg`, `zod`, `pdf-parse`; dev `typescript`, `tsx`, `@types/node`, `@types/pg`, `pino-pretty`.
- web: `react@19`, `react-dom@19`, `react-router@7`, `tailwindcss@4`, `@tailwindcss/vite`, `recharts`, `lucide-react`, `react-markdown`, `clsx`; dev `vite`, `@vitejs/plugin-react`, `typescript`, `@playwright/test` (S3-04 only).
- root dev: `pdfkit`, `@types/pdfkit`, `tsx`.

Root `package.json` scripts: `dev` (api + web via `pnpm -r --parallel dev`), `build`, `typecheck`, `lint`, `smoke` (`bash infra/scripts/smoke.sh`), `sample:pdf` (`tsx docs/sample/generate-sample-pdf.ts`).

## §3 Postgres schema — `infra/db/01-schema.sql`

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- LangChain PGVectorStore uses uuid_generate_v4()

-- Knowledge base documents (exactly one active)
CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text NOT NULL,
  size_bytes   integer NOT NULL,
  page_count   integer,
  chunk_count  integer,
  status       text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  error        text,
  is_active    boolean NOT NULL DEFAULT false,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  ready_at     timestamptz
);
CREATE UNIQUE INDEX documents_one_active ON documents (is_active) WHERE is_active;

-- Vector chunks: EXACT LangChain / n8n PGVector Store layout. Do not rename columns.
CREATE TABLE chunks (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  text      text,
  metadata  jsonb,
  embedding vector(1536)
);
CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_document_id ON chunks ((metadata->>'document_id'));

CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  user_agent       text
);

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user','assistant')),
  content     text NOT NULL,
  category    text CHECK (category IN ('Rooms','Restaurant & Dining','Amenities & Facilities',
                 'Pricing & Booking','Location & Transport','Policies','Events','Other')),
  answered    boolean,           -- set on the USER message (the question) and mirrored on the reply
  sources     jsonb,             -- [{chunk_index, score}] on assistant messages
  latency_ms  integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_session_idx ON messages (session_id, created_at);
CREATE INDEX messages_category_idx ON messages (category) WHERE role = 'user';

CREATE TABLE leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid REFERENCES sessions(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  phone                text NOT NULL,
  email                text NOT NULL,
  unanswered_question  text,
  email_status         text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','failed')),
  email_id             text,
  summary              text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Dashboard query (GET /api/admin/stats and the SSE broadcaster)
CREATE VIEW stats_overview AS
SELECT
  (SELECT count(*) FROM sessions s WHERE EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.role='user'))::int AS total_sessions,
  (SELECT count(*) FROM messages WHERE role='user')::int                       AS total_questions,
  (SELECT count(*) FROM messages WHERE role='user' AND answered = false)::int  AS unanswered_questions,
  (SELECT count(*) FROM leads)::int                                            AS total_leads,
  (SELECT coalesce(json_agg(json_build_object('category', c, 'count', n) ORDER BY n DESC), '[]'::json)
     FROM (SELECT category AS c, count(*) AS n FROM messages WHERE role='user' AND category IS NOT NULL GROUP BY category) t) AS by_category;
```

Notes
- `infra/db/00-create-n8n-db.sh` runs first and creates database `n8n` (n8n's own metadata DB) in the same Postgres instance. The app DB is `hotel` (`POSTGRES_DB`) and holds everything above including `chunks`.
- "Total chat sessions" = sessions with ≥ 1 user message (opening the chat page without asking doesn't count). Documented in `docs/ADMIN-DASHBOARD.md`.
- The single `POSTGRES_USER` is a superuser; n8n's own `CREATE EXTENSION IF NOT EXISTS` calls no-op safely.

## §4 API contract

Base `/api`. JSON everywhere except upload. Errors: `{ "error": { "code": "UPPER_SNAKE", "message": "..." } }`. CORS open (same-origin via nginx in prod anyway). Rate limit 60 req/min/IP (S4-01).

```
GET  /api/health
  → 200 { ok: true, db: "up"|"down", n8n: "up"|"down"|"mock", activeDocument: boolean }

POST /api/sessions
  body: {}   (User-Agent captured from header)
  → 201 { id: uuid, startedAt: iso }

GET  /api/sessions/:id
  → 200 { id, startedAt, messages: Message[] }      404 SESSION_NOT_FOUND

POST /api/sessions/:id/messages
  body: { content: string (1..2000) }
  → 200 {
      userMessage:      { id, role:"user", content, category, answered, createdAt },
      assistantMessage: { id, role:"assistant", content, category, answered, sources, createdAt },
      offerContactForm: boolean        // === !answered
    }
  404 SESSION_NOT_FOUND · 409 NO_DOCUMENT (no ready active document) · 502 ASSISTANT_UNAVAILABLE (n8n error / 30 s timeout)

POST /api/leads
  body: { sessionId: uuid, name: string, phone: string, email: string(email), unansweredQuestion?: string }
  → 201 { id, emailStatus: "sent"|"failed", summary?: string }
  (API builds the transcript from DB, calls WF3, stores result, emits stats event. Lead row persists even if email fails.)

GET  /api/admin/document
  → 200 { document: null | { id, filename, sizeBytes, pageCount, chunkCount, status, error, uploadedAt, readyAt } }

POST /api/admin/document     multipart/form-data, field "file" (application/pdf, ≤ 25 MB)
  → 200 { document: { ...status:"ready", chunkCount } }         (synchronous; typical 10–30 s)
  → 422 INVALID_PDF (bad magic bytes / unparsable) | EMPTY_PDF (< 200 chars extractable text)
  → 502 INGEST_FAILED (document row kept with status "failed"; previous document stays active)

GET  /api/admin/stats
  → 200 StatsSnapshot = { totalSessions, totalQuestions, unansweredQuestions, totalLeads,
                          byCategory: [{ category, count }]  (all 8 categories, zeros included, sorted desc),
                          activeDocument: {...}|null, generatedAt: iso }

GET  /api/admin/stats/stream      Content-Type: text/event-stream
  event: stats        data: <StatsSnapshot JSON>     (immediately on connect, then on every 'stats:changed')
  : ping                                              (comment heartbeat every 20 s)
  headers: Cache-Control: no-cache · X-Accel-Buffering: no · Connection: keep-alive

GET  /internal/documents/:id/file      NOT proxied by nginx; header x-hotel-secret required → application/pdf
```

Message flow (`POST /api/sessions/:id/messages`)
1. Validate body; load session (404); load active `ready` document (else 409 `NO_DOCUMENT`).
2. Insert user message (`category`/`answered` null).
3. Call WF2 with `{ session_id, message_id, question, document_id, history }` where `history` = last 8 messages `{role, content}` before this one. Timeout 30 s.
4. Success: update user message `category`, `answered`; insert assistant message (`content`, `category`, `answered`, `sources`, `latency_ms`); touch `sessions.last_activity_at`; emit `stats:changed`.
5. Failure: leave the user message, return 502 `ASSISTANT_UNAVAILABLE` (UI offers retry — **not** the contact form).

Upload flow (`POST /api/admin/document`)
1. Check magic bytes `%PDF`; save stream to `${UPLOAD_DIR}/<id>.pdf`; `pdf-parse` for `page_count` and text length (< 200 chars → 422 `EMPTY_PDF`, delete file).
2. Insert document (`processing`, `is_active=false`).
3. Call WF1 with `{ document_id, filename, file_url: "${INTERNAL_BASE_URL}/internal/documents/<id>/file" }`. Timeout 180 s.
4. Success: one transaction → set all `is_active=false`; this one `status='ready', is_active=true, chunk_count, ready_at=now()`. Delete the previous document's file. Emit `stats:changed`.
5. Failure: `status='failed', error=<message>`; return 502 `INGEST_FAILED`.

`lib/n8n.ts` interface
```ts
export interface N8nClient {
  ingest(input: { document_id: string; filename: string; file_url: string }): Promise<{ ok: true; document_id: string; chunk_count: number }>;
  chat(input: { session_id: string; message_id: string; question: string; document_id: string; history: { role: 'user'|'assistant'; content: string }[] })
    : Promise<{ answer: string; category: Category; answered: boolean; sources: { chunk_index: number; score: number }[]; model: string }>;
  lead(input: { lead: { name: string; phone: string; email: string }; session_id: string; unanswered_question: string | null; transcript: { role: string; content: string; created_at: string }[] })
    : Promise<{ ok: true; email_id: string | null; summary: string | null }>;
}
```
Mock mode (`N8N_MOCK=1`): `ingest` → `chunk_count: 42`; `chat` → `answered=false` + canned sentence if the question contains `helipad` (case-insensitive), otherwise `answered=true` with category by keyword (room→Rooms, restaurant/breakfast→Restaurant & Dining, pool/gym/spa/wifi→Amenities & Facilities, price/rate/book/cancel/check→Pricing & Booking, airport/shuttle/parking→Location & Transport, pet/smok→Policies, wedding/event/ballroom→Events, else Other); `lead` → `{ ok: true, email_id: "mock", summary: "mock summary" }`.

## §5 n8n workflows

Common
- Every Webhook node: method POST, path `hotel/<name>`, authentication **Header Auth** (credential `Hotel Webhook Secret`: header `x-hotel-secret`), Respond = "Using 'Respond to Webhook' node".
- The API calls `http://n8n:5678/webhook/hotel/<name>` over the Docker network with the same header. The tunnel is never involved.
- Workflow JSON files reference credentials **by name**; `infra/scripts/n8n-import.sh` creates them with fixed ids from `n8n/credentials.template.json` (envsubst from `.env`).

### WF1 `01-ingest-pdf` — path `hotel/ingest`
Input: `{ "document_id": uuid, "filename": string, "file_url": "http://api:3000/internal/documents/<id>/file" }`

1. `Webhook`
2. `HTTP Request` — GET `{{ $json.body.file_url }}`, header `x-hotel-secret` (same credential), Response Format **File**, output binary property `data`
3. `Postgres PGVector Store` — mode **Insert Documents**, table `chunks`, default column names (`id,text,metadata,embedding`)
   - `Default Data Loader` — Type of Data **Binary**, Data Format **PDF**, binary property `data`, Options → Metadata: `document_id = {{ $('Webhook').item.json.body.document_id }}`, `filename = {{ $('Webhook').item.json.body.filename }}`
   - `Recursive Character Text Splitter` — chunk size 1000, overlap 150
   - `Embeddings OpenAI` — `text-embedding-3-small`; Settings → Retry On Fail: 3 tries, 2 s wait
4. `Postgres` (Execute Query) — purge previous documents' vectors **after** the new ones landed:
   `DELETE FROM chunks WHERE metadata->>'document_id' <> $1` with query parameter `{{ $('Webhook').item.json.body.document_id }}`
5. `Postgres` (Execute Query) — `SELECT count(*)::int AS chunk_count FROM chunks WHERE metadata->>'document_id' = $1`
6. `Respond to Webhook` — JSON `{ "ok": true, "document_id": ..., "chunk_count": ... }`

Any node error → n8n returns 500 → API marks the document `failed`.

### WF2 `02-chat-answer` — path `hotel/chat`
Input: `{ "session_id", "message_id", "question", "document_id", "history": [{ "role", "content" }] }` (history = last 8)

1. `Webhook`
2. `Edit Fields (Set)` "Extract" — `question`, `history`, `document_id` from `body`
3. `Postgres PGVector Store` — mode **Get Many** (load), prompt `{{ $json.question }}`, limit 6, Options → Metadata Filter `document_id = {{ $json.document_id }}`
   - `Embeddings OpenAI` — `text-embedding-3-small`
4. `Code` "Build context" — Run Once for All Items. Collects `document.pageContent` + `score` from all input items into ONE item:
   `{ context: "[1] ...\n\n[2] ...", best_score, n_chunks, question, history, document_id }` (`context = ""` and `n_chunks = 0` when nothing returned). Formats `history` as `Guest: ...\nAssistant: ...` lines.
5. `Basic LLM Chain` — prompt = `n8n/prompts/chat-system.md` with `{{ context }}`, `{{ history }}`, `{{ question }}` substituted; "Require Specific Output Format" on
   - `OpenAI Chat Model` — `gpt-4.1-mini`, temperature 0, max tokens 600
   - `Structured Output Parser` — JSON schema:
     `{ "answer": string, "category": enum[8 categories] (with one-line descriptions), "answered": boolean }`
6. `Code` "Guard & finalize" — deterministic invariants:
   - `if (!answered || n_chunks === 0)` → `answer = "I'm sorry, I don't have that information right now."`, `answered = false`
   - category not in taxonomy → `Other`
   - parse failure / missing fields → `answered=false`, `category="Other"`, canned answer
   - optional score guard, **off by default**: workflow static value `SCORE_GUARD = 0`; when set, `best_score` worse than threshold → `answered=false` (S2-02 records the calibrated score semantics in `n8n/README.md`)
   - attach `sources: [{chunk_index, score}]`, `model`, `latency_ms`
7. `Respond to Webhook` — `{ "answer", "category", "answered", "sources", "model" }`

### WF3 `03-lead-email` — path `hotel/lead`
Input: `{ "lead": { "name", "phone", "email" }, "session_id", "unanswered_question", "transcript": [{ "role", "content", "created_at" }] }`

1. `Webhook`
2. `Basic LLM Chain` "Summarize conversation" — prompt `n8n/prompts/lead-summary.md` → 3–5 sentence summary + bullet list of unanswered questions. Settings → **On Error: Continue** (email still goes out with the raw transcript if the LLM fails)
   - `OpenAI Chat Model` — `gpt-4.1-mini`, temperature 0.2
3. `Code` "Compose email" — builds `subject`, `html`, `text`: lead details table, summary, highlighted unanswered question, full transcript
4. `HTTP Request` — POST `https://api.resend.com/emails`, credential `Resend` (Header Auth `Authorization: Bearer <RESEND_API_KEY>`), JSON body
   `{ from: EMAIL_FROM, to: ["idan@tauga.ai","deleonajiraydiego@gmail.com"], reply_to: lead.email, subject: "Cincinnati Hotel chatbot — contact request from <name>", html, text }`
   (`from`/`to` are workflow static values populated by the import script from `EMAIL_FROM` / `LEAD_TO`)
5. `Respond to Webhook` — `{ "ok": true, "email_id": "<resend id>", "summary": "..." }`

### Credentials (`n8n/credentials.template.json`)
| Name | Type | From env |
|---|---|---|
| `OpenAI account` | OpenAI API | `OPENAI_API_KEY` |
| `Hotel Postgres` | Postgres (host `postgres`, db `hotel`) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| `Hotel Webhook Secret` | Header Auth (`x-hotel-secret`) | `N8N_WEBHOOK_SECRET` |
| `Resend` | Header Auth (`Authorization: Bearer …`) | `RESEND_API_KEY` |

### Grounding prompt — `n8n/prompts/chat-system.md`
```
You are the virtual concierge of Cincinnati Hotel. You answer guests' questions using ONLY the
"Hotel information" excerpts below. The excerpts come from the hotel's official document.

Rules:
1. Use only facts stated in the excerpts. Do not use outside knowledge, do not guess, do not invent
   prices, times, names, or policies.
2. If the excerpts fully or partially answer the question, answer concisely (max ~120 words),
   friendly and professional, in the guest's language. Prefer the exact numbers/times from the text.
   Set "answered": true.
3. If the excerpts do NOT contain the information needed, set "answered": false and set "answer" to
   exactly: "I'm sorry, I don't have that information right now."
4. Greetings, thanks, or small talk (no hotel question): reply briefly and warmly, "answered": true,
   "category": "Other".
5. Classify the guest's question into exactly one category:
   Rooms | Restaurant & Dining | Amenities & Facilities | Pricing & Booking |
   Location & Transport | Policies | Events | Other
6. Use the conversation history only to resolve references (e.g. "how much does it cost?"),
   never as a source of facts.

Return ONLY JSON: {"answer": string, "category": string, "answered": boolean}

Hotel information:
{{ context }}

Conversation so far:
{{ history }}

Guest question: {{ question }}
```
The UI (not the model) appends "Would you like to leave your contact details so our team can get back to you?" and renders the contact form when `offerContactForm === true`.

## §6 Frontend

Design: light theme, warm neutral palette (stone + amber accent), system font stack, chat column max 720 px, admin grid max 1100 px. Modern/clean, dependency-light. Mobile-usable at 375 px.

- **`/` Landing** — hotel mark + "Cincinnati Hotel Assistant", one-line subtitle, two large buttons/cards **Admin** (shield icon) and **Regular User** (message icon). Footer "Powered by n8n + OpenAI".
- **`/chat`**
  - On mount `POST /api/sessions`; id stored in `sessionStorage` so refresh keeps the conversation; "New conversation" clears it. Existing session → `GET /api/sessions/:id` to rehydrate.
  - Client-side welcome bubble (not persisted) + 3 suggestion chips (questions answerable from the sample PDF).
  - Bubbles: user right, assistant left with avatar; `react-markdown` for assistant text; subtle category badge under assistant answers; typing indicator (3 dots) while pending.
  - Composer: autosizing textarea, Enter sends, Shift+Enter newline, disabled while pending.
  - `offerContactForm` → inline **ContactFormCard** after the sorry message: Name / Phone / Email → `POST /api/leads` → "Thanks, our team will contact you shortly." (card collapses). "No thanks" dismisses. Shown once per unanswered question.
  - 409 `NO_DOCUMENT` → banner "The knowledge base hasn't been uploaded yet. Please ask an admin." · 502 → retry toast on the failed message.
- **`/admin`**
  - Header with `LiveBadge` (green "Live" when SSE connected, grey "Polling" fallback).
  - **UploadCard**: current document (filename, pages, chunks, uploaded time, status pill) + drag-drop / file picker, "Replace" button, "Processing (embedding chunks)…" state, error display.
  - **StatCards**: Total sessions · Questions asked · Unanswered · Leads captured.
  - **CategoryChart**: Recharts horizontal `BarChart` of questions per category (all 8, sorted desc, zeros rendered, value labels).
  - `useStatsStream`: EventSource on `/api/admin/stats/stream`; after 2 failed reconnects switch to `GET /api/admin/stats` every 10 s.
- Routing: `react-router` `BrowserRouter`; nginx `try_files $uri /index.html`; `*` → NotFound.

`apps/web/nginx.conf` essentials
```
client_max_body_size 50m;
location /api/ {
  proxy_pass http://api:3000/api/;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_set_header Host $host;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;
}
location / { try_files $uri /index.html; }
# /internal/ is deliberately NOT proxied
```

## §7 Docker Compose and environment

`infra/docker-compose.yml`
```yaml
name: cincinnati-hotel
services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}            # hotel
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20

  n8n:
    image: n8nio/n8n:${N8N_VERSION}          # pinned; never :latest
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: ${POSTGRES_USER}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_HOST: ${N8N_HOST}                  # n8n.<domain>
      N8N_PORT: 5678
      N8N_PROTOCOL: https
      N8N_EDITOR_BASE_URL: https://${N8N_HOST}/
      N8N_WEBHOOK_URL: https://${N8N_HOST}/  # replaces deprecated WEBHOOK_URL
      N8N_PROXY_HOPS: 1
      N8N_SECURE_COOKIE: "true"
      N8N_PAYLOAD_SIZE_MAX: 64
      N8N_DEFAULT_BINARY_DATA_MODE: filesystem
      GENERIC_TIMEZONE: Asia/Manila
      TZ: Asia/Manila
      N8N_DIAGNOSTICS_ENABLED: "false"
      N8N_PERSONALIZATION_ENABLED: "false"
    volumes:
      - n8n_data:/home/node/.n8n
      - ../n8n:/import:ro
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:5678/healthz || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 30

  api:
    build: { context: .., dockerfile: apps/api/Dockerfile }
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      n8n: { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      N8N_BASE_URL: http://n8n:5678
      N8N_WEBHOOK_SECRET: ${N8N_WEBHOOK_SECRET}
      N8N_MOCK: ${N8N_MOCK:-0}
      INTERNAL_BASE_URL: http://api:3000
      UPLOAD_DIR: /data/uploads
      MAX_UPLOAD_MB: 25
    volumes:
      - uploads:/data/uploads
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10

  web:
    build: { context: .., dockerfile: apps/web/Dockerfile }
    restart: unless-stopped
    depends_on: [api]

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on: [web, n8n]
    profiles: ["tunnel"]
    # Public hostnames (Zero Trust dashboard):  hotel.<domain> → http://web:80   n8n.<domain> → http://n8n:5678

volumes:
  pgdata:
  n8n_data:
  uploads:
```

`infra/compose.override.yml` (dev only; auto-merged when running from `infra/`, or pass `-f` both; deploy uses `-f docker-compose.yml` only)
- ports: postgres `5432:5432`, n8n `5678:5678`, api `${API_HOST_PORT:-3000}:3000`, web `8080:80`
- n8n env: `N8N_PROTOCOL=http`, `N8N_HOST=localhost`, `N8N_WEBHOOK_URL=http://localhost:5678/`, `N8N_EDITOR_BASE_URL=http://localhost:5678/`, `N8N_SECURE_COOKIE=false`

Production: `docker compose -f infra/docker-compose.yml --profile tunnel up -d --build`.

`.env.example`
```
# Postgres
POSTGRES_USER=hotel
POSTGRES_PASSWORD=change-me
POSTGRES_DB=hotel
# n8n
N8N_VERSION=            # S0-04 pins the current stable tag here
N8N_ENCRYPTION_KEY=     # openssl rand -hex 24
N8N_HOST=n8n.example.com
N8N_WEBHOOK_SECRET=     # openssl rand -hex 24
N8N_MOCK=0
# Public
PUBLIC_WEB_HOST=hotel.example.com
CLOUDFLARE_TUNNEL_TOKEN=
# Keys — consumed ONLY by the n8n credentials import; the API never talks to OpenAI/Resend
OPENAI_API_KEY=
RESEND_API_KEY=
EMAIL_FROM="Cincinnati Hotel Assistant <concierge@example.com>"
LEAD_TO=idan@tauga.ai,deleonajiraydiego@gmail.com
```

Local dev without containers for api/web: `docker compose -f infra/docker-compose.yml up -d postgres n8n`, then `pnpm dev` with `DATABASE_URL=postgres://hotel:…@localhost:5432/hotel`, `N8N_BASE_URL=http://localhost:5678`, `INTERNAL_BASE_URL=http://host.docker.internal:3000` (so n8n in Docker can reach the host API).

ngrok alternative (`infra/cloudflared/README.md`): one ngrok agent with two tunnels (`web` → 8080, `n8n` → 5678) or two `ngrok http` processes; set `N8N_HOST` / `N8N_WEBHOOK_URL` / `N8N_EDITOR_BASE_URL` to the ngrok n8n hostname.

## §8 Verification

1. **Local full stack**: `docker compose -f infra/docker-compose.yml up -d --build`. First run: open `http://localhost:5678`, create the owner account, run `bash infra/scripts/n8n-import.sh`.
2. **Seed**: `pnpm sample:pdf` (already committed) → upload via `http://localhost:8080/admin` or `curl -F file=@docs/sample/cincinnati-hotel.pdf localhost:8080/api/admin/document`.
3. **Scripted smoke** `bash infra/scripts/smoke.sh --base http://localhost:8080`:
   - upload → `status=ready`, `chunkCount > 10` (mock: 42)
   - `POST /api/sessions` → id
   - "What time is check-in?" → `answered=true`, content contains "3", category ∈ {Pricing & Booking, Policies}
   - "Is there a helipad on the roof?" → `answered=false`, content == canned sentence, `offerContactForm=true`
   - `POST /api/leads` → 201, `emailStatus=sent` (mock: sent)
   - `GET /api/admin/stats` → totals incremented, byCategory contains the category above
   - `curl -N --max-time 4 .../stats/stream | grep -m1 'event: stats'`
4. **Accuracy set** `docs/sample/questions.json` (6 answerable + 4 unanswerable): ≥ 9/10 correct `answered` (S2-02, S4-01).
5. **Playwright** (S3-04, droppable): user journey + admin realtime across two pages.
6. **Public**: re-run smoke against `https://hotel.<domain>`; confirm n8n executions visible at `https://n8n.<domain>`.

## §9 Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | n8n PGVector node table/column/score semantics differ from assumption | Pre-created LangChain-layout table; pinned `N8N_VERSION`; S2-01 verifies insert; S2-02 logs scores; LLM `answered` flag is the primary signal, score guard off by default |
| 2 | Hand-authored workflow JSON fails to import (typeVersion drift) | Opus owns S2-01/02; CLI import in first 20 min; escape hatch: build in n8n UI (~45 min) and export to repo |
| 3 | Resend can't deliver to third parties without a verified domain | S0-06 verifies a domain in Cloudflare DNS; test with own inbox first; fallback Gmail SMTP via n8n Send Email node |
| 4 | Tunnel/n8n URL config; SSE buffered or dropped by nginx/Cloudflare | `N8N_WEBHOOK_URL` + `N8N_PROXY_HOPS`; API→n8n bypasses tunnel; `proxy_buffering off`; 20 s heartbeat; EventSource reconnect + 10 s polling fallback |
| 5 | Scanned PDFs, OpenAI rate limits, deadline | Reject < 200 chars text with a clear admin error; chunk 1000/150; Retry On Fail on embeddings; S3-04 and S4-02 droppable; gates force a working deploy before polish |
