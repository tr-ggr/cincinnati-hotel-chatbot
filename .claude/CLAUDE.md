# Cincinnati Hotel Chatbot — agent conventions

## What this is
Tauga AI entrance task (see `docs/Cincinnati-Hotel-Chatbot-Entrance-Task.pdf`). A hotel chatbot that answers
**only** from an admin-uploaded PDF, with a contact-form fallback that emails reviewers, and a real-time admin
stats dashboard.

Stack: React 19 + Vite + Tailwind v4 (`apps/web`) → nginx → Fastify 5 API (`apps/api`) → **n8n** webhooks
(`apps/n8n/`) → OpenAI / Postgres+pgvector / Resend. Everything runs via Docker Compose (`compose.yml` at the root), exposed through a
Cloudflare Tunnel. **All AI logic lives in n8n workflows; the API never calls OpenAI directly.**

Read `docs/ARCHITECTURE.md` first — it is the single source of truth for the schema, API contract, n8n
workflows, compose topology and prompts. Sprint cards reference its sections (§).

## Commands
- Install: `pnpm install` (pnpm 11; Node ≥ 22 locally, node:22-alpine in containers)
- Dev stack: `docker compose up -d postgres n8n` then `pnpm dev` (api :3000, web :5173)
- Full stack: `docker compose up -d --build --wait` → web http://localhost:8080, n8n http://localhost:5678
  (run at the repo root; `compose.override.yml` is auto-merged locally and exposes ports; deploy uses `-f compose.yml` only)
- Postgres init: `migrations/` (`00-create-n8n-db.sh`, `01-schema.sql`) runs only on an empty `pgdata` volume.
- Turborepo runs every task: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test` (Vitest: api, web, n8n)
- E2E (Playwright, `e2e/` at the root, stack must be running): `pnpm e2e` (api + ui projects), `pnpm e2e:real` (+ accuracy set and
  lead webhook; sends real email to `LEAD_TO`). First time: `pnpm --filter e2e browsers`. Override target with `E2E_BASE_URL`.
- n8n import: `pnpm n8n:import` (requires the n8n owner account to have been created in the UI once)
- Sample PDF: `pnpm sample:pdf` → `docs/sample/cincinnati-hotel.pdf`

## Conventions
- TypeScript strict, ESM, no default exports except React pages. No ORM: all SQL lives in `apps/api/src/db/queries.ts`.
- API contract is `docs/ARCHITECTURE.md` §4. `apps/web/src/lib/api.ts` must mirror it exactly — change both together.
- Categories: the 8-value list in `apps/api/src/lib/categories.ts` and `apps/web/src/lib/categories.ts` must stay identical
  to the CHECK constraint in `migrations/01-schema.sql` and the Structured Output Parser schema in `apps/n8n/workflows/02-*.json`.
  Values: `Rooms`, `Restaurant & Dining`, `Amenities & Facilities`, `Pricing & Booking`, `Location & Transport`, `Policies`, `Events`, `Other`.
- Canned fallback sentence (exact, used by n8n Guard node, API mock and the tests):
  `I'm sorry, I don't have that information right now.`
- Errors: `{ error: { code, message } }`. Codes are UPPER_SNAKE (`NO_DOCUMENT`, `ASSISTANT_UNAVAILABLE`, `INVALID_PDF`, `EMPTY_PDF`, `INGEST_FAILED`).
- Secrets only in `.env` (never committed). `apps/n8n/credentials.template.json` uses `${VAR}` placeholders filled by envsubst at import time.
- n8n workflow JSON in `apps/n8n/workflows/` is the source of truth. After editing in the UI, re-export:
  `docker compose exec n8n n8n export:workflow --all --separate --output=/import/workflows`
- Never float `n8nio/n8n:latest`; `N8N_VERSION` is pinned in `.env(.example)`.
- Keep the UI dependency-light: Tailwind v4, lucide-react, react-markdown, clsx. No shadcn, no chart or state libraries. Visual system: `apps/web/DESIGN.md`.
- Tests: API tests live in `apps/api/test/` (outside `src/`, so `tsc` builds ignore them) and use `buildApp` from `src/app.ts`;
  web tests sit next to the code as `*.test.ts`. The category / prompt parity tests enforce the two rules above.
- Ports: web 8080 (nginx) / 5173 (vite), api 3000, n8n 5678, postgres 5432 (api/postgres host ports overridable via API_HOST_PORT / POSTGRES_HOST_PORT).
- Commits: conventional one-liners (`feat: …`, `fix: …`, `chore: …`). **Never add Claude as a co-author** on commits.

## Working rules for subagents
- Run `pnpm typecheck && pnpm test` (and `pnpm e2e` when the stack is up) before reporting done and paste the output.
- Don't add a package without saying why in your report.
- If a decision is not covered by `docs/ARCHITECTURE.md`, pick the simplest option that works and note it in the report.

## Gotchas
- `chunks` is pre-created with the LangChain/n8n PGVector layout (`id uuid, text, metadata jsonb, embedding vector(1536)`).
  Do not rename columns; the n8n PGVector Store node expects them.
- SSE responses must send `X-Accel-Buffering: no`, `Cache-Control: no-cache`, and a `: ping` comment every 20 s
  (nginx + Cloudflare Tunnel will otherwise buffer or drop the stream).
- The API calls n8n internally at `http://n8n:5678/webhook/hotel/<name>` with header `x-hotel-secret` — never through the tunnel.
- `/internal/*` API routes are not proxied by nginx and require the `x-hotel-secret` header (used by n8n to download the PDF).
- n8n behind the tunnel needs `N8N_WEBHOOK_URL` (not the deprecated `WEBHOOK_URL`) and `N8N_PROXY_HOPS=1`.
- Windows dev machine: use `bash` (Git Bash) for `apps/n8n/scripts/import.sh`; the deploy target is a Linux VPS.
