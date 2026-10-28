# Cincinnati Hotel Chatbot

A hotel information assistant for guests. It answers **only** from the PDF an admin uploads. When it cannot answer,
it offers a contact form, and the conversation summary is emailed to the hotel team. Admins get a live dashboard of
sessions, questions, unanswered questions, leads and categories, which updates without a page reload.

Built for the Tauga AI entrance task. The brief is in [`docs/Cincinnati-Hotel-Chatbot-Entrance-Task.pdf`](docs/Cincinnati-Hotel-Chatbot-Entrance-Task.pdf).

## Why it is built this way

- **Grounded answers.** Retrieval is scoped to the active document. The model gets at most six excerpts and must reply
  with the canned sentence when they do not contain the answer. When nothing is retrieved, the model is not called.
- **All AI in n8n.** Ingest, retrieval, answering, classification and the lead email are visible n8n workflows. The
  API never calls OpenAI or Resend, so prompts and models can be inspected in the editor.
- **Real-time admin.** Changes are pushed over Server-Sent Events and fall back to polling if the stream is interrupted.
- **One command to run.** Docker Compose starts Postgres with pgvector, n8n, the API and the web app. Production
  adds a Cloudflare Tunnel, so the VPS needs no open ports.

## Screenshots

Screenshots of the guest chat, the contact form and the admin dashboard will be added under `docs/screenshots/` at
submission.

## Documentation

| Document | What it covers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture diagram, technology choices, database schema, API contract, n8n workflow contracts, compose and environment. The source of truth |
| [`docs/PDF-PROCESSING.md`](docs/PDF-PROCESSING.md) | How a PDF is ingested (download, split, embed, store, purge), how a question is answered from it, and how "I don't know" is decided |
| [`docs/ADMIN-DASHBOARD.md`](docs/ADMIN-DASHBOARD.md) | Dashboard design, what each statistic counts, and the real-time data flow with its polling fallback |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Prerequisites, local runs (mock and real), environment table, n8n first run and import, smoke and end-to-end tests, VPS deploy, extending the app, troubleshooting |
| [`n8n/README.md`](n8n/README.md) | Node-by-node reference for the three workflows, credentials, import and export |
| [`sprints/README.md`](sprints/README.md) | How the build was planned: sprint cards and the status log |
| [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | Conventions for AI agents working in this repository |

## Stack

React 19 with Vite and Tailwind v4 (web) · Fastify 5 with TypeScript (API) · n8n 2.45.5 (all AI orchestration) ·
Postgres 16 with pgvector · OpenAI (`text-embedding-3-small`, `gpt-4.1-mini`) · Resend (email) · Docker Compose ·
nginx · Cloudflare Tunnel.

Repository layout: `apps/api` (API), `apps/web` (web app), `n8n/` (workflows, prompts, credential template),
`infra/` (compose files, database init, scripts), `docs/` (documentation and the sample PDF), `sprints/` (build plan).

## Quickstart

Requirements: Docker with Compose v2, and Git Bash on Windows (or bash on Linux and macOS) with `jq` and `envsubst`.
The full list is in the [RUNBOOK](docs/RUNBOOK.md#prerequisites).

### 1. Mock mode (no API keys needed)

Mock mode replaces the n8n and OpenAI calls with an in-process mock, so the whole stack can be checked without keys.

```bash
cp .env.example .env
# edit .env: set N8N_MOCK=1, POSTGRES_PASSWORD, N8N_ENCRYPTION_KEY and N8N_WEBHOOK_SECRET
#   (openssl rand -hex 24 works for the two keys)

docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d --build
bash infra/scripts/smoke.sh --base http://localhost:8080 --mock
```

Open <http://localhost:8080>. On Windows, if port 8080 is held by another program, use <http://[::1]:8080>.

### 2. Real mode (OpenAI and Resend)

1. In `.env`, set `N8N_MOCK=0`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, and `LEAD_TO` set to your own inbox.
2. Start the stack with the same command as above.
3. Open the n8n editor at <http://localhost:5678> and create the owner account (once).
4. Import the credentials and workflows: `bash infra/scripts/n8n-import.sh`.
5. Upload `docs/sample/cincinnati-hotel.pdf` at <http://localhost:8080/admin> and wait for **Ready**.
6. Check the answers and the full stack:

   ```bash
   bash infra/scripts/chat-eval.sh                       # at least 9 of 10 answered flags must match
   bash infra/scripts/smoke.sh --base http://localhost:8080
   ```

The smoke test's lead step sends a real email to `LEAD_TO`. Run `bash infra/scripts/lead-test.sh` to test the lead flow
on its own; it refuses an empty `LEAD_TO`.

For development with hot reload, the non-container setup, the environment table, deployment to a VPS behind a
Cloudflare Tunnel, and troubleshooting, see the [RUNBOOK](docs/RUNBOOK.md).
