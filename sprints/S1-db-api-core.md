# S1 — DB + API core

- Budget: ≤ 2 h · Target done: 22:30 PHT
- Goal: the full API contract (ARCHITECTURE §4) works end-to-end against Postgres with the n8n client in **mock mode**, verified by a scripted smoke test.
- Gate:
    - `N8N_MOCK=1 docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d --build api web`
    - `bash infra/scripts/smoke.sh --mock --base http://localhost:8080` exits 0
    - `pnpm typecheck` exits 0
- Commit on pass: `S1: api core`

Parallelism: S1-01 first (alone). Then S1-02 and S1-03 concurrently. Then S1-04.

---

### S1-01 · DB layer, libs, n8n client interface + mock
- model: sonnet 5.5
- depends_on: [S0 gate]
- human: false
- owns:
    - apps/api/src/db/**
    - apps/api/src/lib/**
    - apps/api/scripts/db-check.ts
- may_read: [apps/api/**, infra/db/01-schema.sql, docs/ARCHITECTURE.md, .claude/CLAUDE.md]
- acceptance:
    - pnpm --filter api typecheck
    - bash -c 'cd apps/api && DATABASE_URL=postgres://hotel:hotel@localhost:5432/hotel N8N_MOCK=1 N8N_BASE_URL=http://localhost:5678 N8N_WEBHOOK_SECRET=x INTERNAL_BASE_URL=http://localhost:3000 UPLOAD_DIR=/tmp/uploads npx tsx scripts/db-check.ts'
- scope: |
    Implement per ARCHITECTURE §3/§4:
    - `db/pool.ts`: `pg.Pool` from `DATABASE_URL`; export `query<T>(text, params)` and `withTransaction(fn)`.
    - `db/queries.ts`: typed functions — createSession(userAgent), getSession(id), listMessages(sessionId), listRecentMessages(sessionId, limit=8),
      insertMessage({sessionId, role, content, category?, answered?, sources?, latencyMs?}), updateMessageClassification(id, category, answered),
      touchSession(id), insertLead(...), updateLeadEmail(id, status, emailId, summary), insertDocument(...), activateDocument(id, chunkCount)
      (transaction: deactivate all → activate one), failDocument(id, error), getActiveDocument(), getDocument(id), getStatsOverview().
      camelCase the row results. No ORM.
    - `lib/categories.ts`: `CATEGORIES` tuple (exact 8 strings), `Category` type, `isCategory()`, `CANNED_FALLBACK` constant (exact sentence).
    - `lib/events.ts`: singleton EventEmitter, `emitStatsChanged()`, `onStatsChanged(fn) → unsubscribe`.
    - `lib/stats.ts`: `getStats(): Promise<StatsSnapshot>` — reads `stats_overview`, fills all 8 categories with zeros, sorted desc, adds
      `activeDocument` and `generatedAt`.
    - `lib/sse.ts`: `openSse(reply)` → `{ send(event, data), close() }`; sets headers (`text/event-stream`, `Cache-Control: no-cache`,
      `X-Accel-Buffering: no`, `Connection: keep-alive`), writes `: ping\n\n` every 20 s, clears timer on `request.raw.on('close')`.
    - `lib/n8n.ts`: export `N8nClient` interface exactly as §4, `createN8nClient(config)` returning the **mock** when `N8N_MOCK=1`
      (behaviour per §4 "Mock mode") and a stub that throws `NotImplemented` otherwise (S2-04 replaces the stub). Export `N8nError` with `code`.
    - `apps/api/scripts/db-check.ts`: connects, creates a session, inserts a user message, reads stats, prints JSON, exits 0.
    HANDOFF anything needed in `index.ts`/routes.

### S1-02 · Sessions & leads routes
- model: sonnet 5.5
- depends_on: [S1-01]
- human: false
- owns:
    - apps/api/src/routes/sessions.ts
    - apps/api/src/routes/leads.ts
- may_read: [apps/api/src/**, docs/ARCHITECTURE.md, .claude/CLAUDE.md]
- acceptance:
    - pnpm --filter api typecheck
- scope: |
    Implement `POST /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/messages`, `POST /api/leads` exactly per
    ARCHITECTURE §4 including the message flow (steps 1–5), error codes (`SESSION_NOT_FOUND`, `NO_DOCUMENT`, `ASSISTANT_UNAVAILABLE`,
    `VALIDATION_ERROR`), zod body validation, `latency_ms` measurement, `emitStatsChanged()` after successful writes.
    Leads: validate, insert lead, build transcript from `listMessages`, call `n8n.lead(...)`, update lead email status (`sent`/`failed`),
    never fail the request because the email failed (return 201 with `emailStatus`). Export `registerSessionRoutes(app)` and
    `registerLeadRoutes(app)` as Fastify plugins. Do NOT edit `index.ts` — S1-03 registers routes; put the exact import lines in HANDOFF
    if S1-03 needs them (S1-03 is told the export names).

### S1-03 · Admin, internal routes, SSE, app wiring
- model: sonnet 5.5
- depends_on: [S1-01]
- human: false
- owns:
    - apps/api/src/routes/admin.ts
    - apps/api/src/routes/internal.ts
    - apps/api/src/routes/health.ts
    - apps/api/src/index.ts
- may_read: [apps/api/src/**, docs/ARCHITECTURE.md, .claude/CLAUDE.md]
- acceptance:
    - pnpm --filter api typecheck
    - pnpm --filter api build
- scope: |
    Implement per ARCHITECTURE §4: `GET /api/admin/document`, `POST /api/admin/document` (multipart field `file`, `%PDF` magic check,
    stream to `${UPLOAD_DIR}/<id>.pdf`, `pdf-parse` page count + text length check → `EMPTY_PDF`, insert doc, call `n8n.ingest`,
    activate on success / fail on error, delete old file, emit stats; errors `INVALID_PDF`, `EMPTY_PDF`, `INGEST_FAILED`),
    `GET /api/admin/stats`, `GET /api/admin/stats/stream` (openSse → send snapshot immediately → subscribe to `onStatsChanged` →
    send new snapshot on each event → unsubscribe on close), `GET /internal/documents/:id/file` (require `x-hotel-secret` ===
    config.N8N_WEBHOOK_SECRET, else 401; stream file as `application/pdf`). Real `GET /api/health` (db ping, n8n = "mock" when N8N_MOCK else
    GET `${N8N_BASE_URL}/healthz` with 2 s timeout, activeDocument).
    `index.ts`: register cors, multipart (file size from config), routes: health, sessions (`registerSessionRoutes` from `./routes/sessions.js`),
    leads (`registerLeadRoutes` from `./routes/leads.js`), admin, internal; global error handler mapping `N8nError`/zod/Fastify errors to
    `{error:{code,message}}`; ensure `UPLOAD_DIR` exists on boot; graceful shutdown closes the pool.

### S1-04 · Smoke test script
- model: haiku 5.5
- depends_on: [S1-02, S1-03]
- human: false
- owns:
    - infra/scripts/smoke.sh
- may_read: [docs/ARCHITECTURE.md, apps/api/src/routes/**, docs/sample/questions.json]
- acceptance:
    - bash -n infra/scripts/smoke.sh
    - bash -c 'N8N_MOCK=1 docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d --build api web && sleep 5 && bash infra/scripts/smoke.sh --mock --base http://localhost:8080'
- scope: |
    Bash + curl + jq script per ARCHITECTURE §8 step 3. Flags: `--base URL` (default http://localhost:8080), `--mock` (relaxes
    content assertions: chunkCount==42, category just must be valid), `--only a,b` (subset of `upload,chat,lead,stats,sse`).
    Steps and assertions: health 200 → upload `docs/sample/cincinnati-hotel.pdf` → status ready, chunkCount>10 → create session →
    "What time is check-in?" → answered true, category valid (real mode: content contains "3") → "Is there a helipad on the roof?" →
    answered false, content == canned sentence, offerContactForm true → POST lead → 201 → GET stats → totalSessions ≥1, totalQuestions ≥2,
    unansweredQuestions ≥1, totalLeads ≥1, byCategory has 8 entries → SSE: `curl -N --max-time 4 .../stats/stream | grep -m1 'event: stats'`.
    Print a clear PASS/FAIL line per step, exit non-zero on first failure. Must run under Git Bash on Windows and bash on Linux
    (`jq` required — print an install hint if missing).
