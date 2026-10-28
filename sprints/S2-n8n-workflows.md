# S2 — n8n workflows

- Budget: ≤ 3 h · Target done: 02:00 PHT (runs in parallel with S3)
- Goal: the three n8n workflows (ARCHITECTURE §5) are importable by script, active, and the API talks to them for real (`N8N_MOCK=0`).
- Gate:
    - `.env` has `N8N_MOCK=0`, real `OPENAI_API_KEY`, `RESEND_API_KEY`; n8n owner account exists (open http://localhost:5678 once)
    - `bash infra/scripts/n8n-import.sh` exits 0 and the three workflows show **Active** in the UI
    - `docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d --build api`
    - `bash infra/scripts/smoke.sh --base http://localhost:8080` exits 0 (real mode)
    - Re-export so repo JSON == deployed JSON:
      `docker compose ... exec -T n8n n8n export:workflow --all --separate --output=/tmp/wf` then `docker compose ... cp n8n:/tmp/wf/. n8n/workflows/`
      and rename to the 3 canonical file names.
- Commit on pass: `S2: n8n workflows`

Parallelism: S2-01 first (alone — it establishes the import pipeline). Then S2-02 and S2-03 concurrently. Then S2-04 and S2-05 concurrently.

Escape hatch (orchestrator decision, record in STATUS.md): if S2-01 or S2-02 spend > 30 min fighting JSON import errors (typeVersion /
parameter drift), switch to building that workflow by hand in the n8n UI following §5 node-by-node, then export it into `n8n/workflows/`
with the CLI above. The card's acceptance still applies.

Compose shorthand used below: `DC="docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml"`.

---

### S2-01 · Credentials template, import script, WF1 ingest
- model: opus 5.5
- depends_on: [S1 gate]
- human: false
- owns:
    - n8n/credentials.template.json
    - n8n/workflows/01-ingest-pdf.json
    - infra/scripts/n8n-import.sh
- may_read: [docs/ARCHITECTURE.md, infra/**, apps/api/src/lib/n8n.ts, .env.example, .claude/CLAUDE.md]
- acceptance:
    - bash infra/scripts/n8n-import.sh
    - bash -c 'set -e; source .env; DOC=$(curl -fsS -F file=@docs/sample/cincinnati-hotel.pdf http://localhost:8080/api/admin/document | jq -r .document.id); curl -fsS -X POST http://localhost:5678/webhook/hotel/ingest -H "x-hotel-secret: $N8N_WEBHOOK_SECRET" -H "content-type: application/json" -d "{\"document_id\":\"$DOC\",\"filename\":\"cincinnati-hotel.pdf\",\"file_url\":\"http://api:3000/internal/documents/$DOC/file\"}" | tee /dev/stderr | jq -e ".ok==true and .chunk_count>10"'
    - bash -c 'docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml exec -T postgres psql -U hotel -d hotel -tAc "select count(*)>10 from chunks" | grep -q t'
- scope: |
    Acceptance step 2 assumes the API is running in **mock** mode (`N8N_MOCK=1`, as left by the S1 gate) so the upload succeeds without
    WF1 and the file is then available at the internal URL for the direct webhook call.
    1. `n8n/credentials.template.json`: array of 4 credentials per ARCHITECTURE §5 table with fixed ids (`cred-openai`, `cred-postgres`,
       `cred-webhook-secret`, `cred-resend`) and `${VAR}` placeholders in the `data` fields. n8n `import:credentials` accepts decrypted JSON
       with plain `data` objects — verify on the pinned version; if it does not, create credentials through the REST API
       (`POST /rest/credentials` with an n8n API key) instead and document the switch.
    2. `infra/scripts/n8n-import.sh` (Git Bash / Linux): load `.env`, `envsubst` the template into a temp file, copy it into the n8n container,
       run `n8n import:credentials --input=...`, `n8n import:workflow --separate --input=/import/workflows` (for WF3, first sed a temp copy to
       substitute `${EMAIL_FROM}` / `${LEAD_TO}` so the repo file keeps placeholders), `n8n update:workflow --all --active=true`, then
       `docker compose restart n8n` and wait for `/healthz`. Idempotent (re-running updates in place). Print the n8n version; exit non-zero
       on any failure.
    3. `n8n/workflows/01-ingest-pdf.json` exactly per §5 WF1 (Webhook with header auth → HTTP Request file → PGVector Insert with Data Loader /
       Splitter / Embeddings sub-nodes → purge → count → Respond). Credentials referenced by id + name from step 1. Use node typeVersions valid for
       the pinned `N8N_VERSION` (create a throwaway workflow in the UI and export it to see current typeVersions if unsure).
    Verify end to end with the acceptance commands; paste the chunk_count.

### S2-02 · WF2 chat answer + grounding prompt + score calibration
- model: opus 5.5
- depends_on: [S2-01]
- human: false
- owns:
    - n8n/workflows/02-chat-answer.json
    - n8n/prompts/chat-system.md
    - n8n/README.md
    - infra/scripts/chat-eval.sh
- may_read: [docs/ARCHITECTURE.md, n8n/**, docs/sample/questions.json, infra/scripts/n8n-import.sh]
- acceptance:
    - bash infra/scripts/n8n-import.sh
    - bash infra/scripts/chat-eval.sh
- scope: |
    Write `n8n/prompts/chat-system.md` verbatim from ARCHITECTURE §5 (grounding prompt). Build `02-chat-answer.json` per §5 WF2:
    Webhook → Set → PGVector Get Many (limit 6, metadata filter document_id) + Embeddings → Code "Build context" → Basic LLM Chain
    (prompt from the .md with placeholders substituted; OpenAI Chat Model gpt-4.1-mini temp 0; Structured Output Parser with the 8-enum
    schema and one-line category descriptions) → Code "Guard & finalize" (invariants per §5; `SCORE_GUARD` static value default 0) → Respond.
    Write `infra/scripts/chat-eval.sh`: sources `.env`, finds the current `document_id` from `chunks`, posts each of the 10 questions in
    `docs/sample/questions.json` directly to `http://localhost:5678/webhook/hotel/chat` (header secret, empty history), prints
    question / expected / got / category / best_score, and exits 0 only if ≥ 9/10 `answered` values match. Also assert in the script that
    "hi there!" returns answered=true + category Other, and that a random `document_id` returns the canned fallback with answered=false.
    Then calibrate: from the logged `best_score` values determine whether the PGVector node score is a distance (lower = better) or a
    similarity (higher = better) on this n8n version and write that plus a suggested threshold into a "Retrieval score semantics" section
    of `n8n/README.md` (create the file with that section + a TODO header; S2-05 fills the rest). Paste the eval output.

### S2-03 · WF3 lead email
- model: sonnet 5.5
- depends_on: [S2-01]
- human: false
- owns:
    - n8n/workflows/03-lead-email.json
    - n8n/prompts/lead-summary.md
    - infra/scripts/lead-test.sh
- may_read: [docs/ARCHITECTURE.md, n8n/**, infra/scripts/n8n-import.sh]
- acceptance:
    - bash infra/scripts/n8n-import.sh
    - bash infra/scripts/lead-test.sh
- scope: |
    IMPORTANT: while developing this card, `LEAD_TO` in `.env` must be the user's own inbox (ask the orchestrator/user for the address);
    never email the reviewers during testing. Write `n8n/prompts/lead-summary.md` (3–5 sentence neutral summary of the conversation +
    bullet list of questions the assistant could not answer; plain text). Build `03-lead-email.json` per §5 WF3: Webhook → Basic LLM Chain
    "Summarize" (On Error: Continue, temp 0.2) → Code "Compose email" (subject, html, text per §5; falls back to the raw transcript if the
    summary is missing) → HTTP Request to Resend (credential `cred-resend`; `from` / `to` come from the `${EMAIL_FROM}` / `${LEAD_TO}`
    placeholders that `n8n-import.sh` substitutes; `to` split on commas) → Respond `{ok, email_id, summary}`.
    Write `infra/scripts/lead-test.sh`: sources `.env`, posts a fake lead + 2-message transcript (unanswered question "Is there a helipad on
    the roof?") to `http://localhost:5678/webhook/hotel/lead` with the secret header, prints the response, exits 0 only if `.ok==true` and
    `.email_id` is non-empty. Confirm the email actually arrives in the test inbox and paste the Resend id.

### S2-04 · Real n8n client in the API
- model: sonnet 5.5
- depends_on: [S2-02, S2-03]
- human: false
- owns:
    - apps/api/src/lib/n8n.ts
- may_read: [apps/api/src/**, docs/ARCHITECTURE.md, n8n/workflows/*.json]
- acceptance:
    - pnpm --filter api typecheck
    - bash -c 'docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d --build api && sleep 5 && bash infra/scripts/smoke.sh --base http://localhost:8080'
- scope: |
    Replace the `NotImplemented` stub in `lib/n8n.ts` with a real client: `fetch` to `${N8N_BASE_URL}/webhook/hotel/{ingest|chat|lead}`,
    header `x-hotel-secret`, JSON body, `AbortSignal.timeout` (ingest 180 s, chat 30 s, lead 30 s), response validation with zod (coerce
    `category` through `isCategory` → Other), map non-2xx / timeout / network errors to `N8nError` with codes `INGEST_FAILED` /
    `ASSISTANT_UNAVAILABLE` / `LEAD_EMAIL_FAILED`. Keep the mock path untouched. Set `N8N_MOCK=0` in `.env` before the acceptance run
    (the S2 gate runs in real mode from here on).

### S2-05 · n8n README
- model: haiku 5.5
- depends_on: [S2-02, S2-03]
- human: false
- owns:
    - n8n/README.md
- may_read: [n8n/**, docs/ARCHITECTURE.md, infra/scripts/n8n-import.sh]
- acceptance:
    - bash -c 'grep -q "01-ingest-pdf" n8n/README.md && grep -q "02-chat-answer" n8n/README.md && grep -q "03-lead-email" n8n/README.md && grep -q "Retrieval score semantics" n8n/README.md'
- scope: |
    Complete `n8n/README.md` (keep the "Retrieval score semantics" section from S2-02 intact): purpose of each workflow with a node-by-node
    table (node, type, key parameters, why), the credentials table, how the API calls the webhooks (internal URL + header), import procedure
    (`n8n-import.sh`), export procedure (CLI command from the S2 gate), how to re-pin `N8N_VERSION`, how to swap the OpenAI model or the
    email provider, and a troubleshooting list (webhook 404 = workflow inactive; 403 = wrong secret; empty retrieval = no document_id match).
    Link to `docs/PDF-PROCESSING.md` (written in S4).
