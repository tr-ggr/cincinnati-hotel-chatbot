# n8n workflows

All AI logic of the chatbot lives in three n8n workflows. The API (`apps/api`) never calls OpenAI or Resend
directly; it calls these workflows over the internal Docker network. Architecture background:
[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (§1 decisions, §5 workflow contracts, §7 compose and env).
PDF ingestion in depth: [`docs/PDF-PROCESSING.md`](../../docs/PDF-PROCESSING.md) (written in S4).

Pinned runtime: **n8n `2.45.5`** (`N8N_VERSION` in `.env`, never `latest`).

## Overview

| # | Workflow (file) | Workflow id | Webhook path | Purpose | Called by |
|---|---|---|---|---|---|
| 1 | `01-ingest-pdf.json` | `hotelIngestPdf01` | `POST /webhook/hotel/ingest` | Download an uploaded PDF, split it, embed it and store the chunks in `chunks` (pgvector), then purge older documents' chunks | API, on admin upload |
| 2 | `02-chat-answer.json` | `hotelChatAnswr02` | `POST /webhook/hotel/chat` | Retrieve the top 6 chunks of the active document, answer **only** from them, classify the question into one of 8 categories | API, on each guest message |
| 3 | `03-lead-email.json` | `hotelLeadEmail03` | `POST /webhook/hotel/lead` | Summarise the chat and email it to the reviewers via Resend (`reply_to` = guest) | API, on contact form submit |

Workflow ids are fixed (re-imports overwrite in place). Each workflow JSON carries a top-level `id`; the import script
depends on it.

## WF1 `01-ingest-pdf` (path `hotel/ingest`)

Input: `{ "document_id": uuid, "filename": string, "file_url": "http://api:3000/internal/documents/<id>/file" }`

```
Webhook → Download PDF (HTTP Request) → Postgres PGVector Store [insert, table chunks]
                                          ├─ ai_document  ← Default Data Loader (PDF, metadata)
                                          │                  └─ ai_textSplitter ← Recursive Character Text Splitter
                                          └─ ai_embedding ← Embeddings OpenAI
        → Purge old vectors (Postgres) → Count chunks (Postgres) → Respond to Webhook { ok, document_id, chunk_count }
```

| Node | Type (typeVersion) | Key parameters | Why |
|---|---|---|---|
| `Webhook` | `n8n-nodes-base.webhook` (2.2) | `POST`, path `hotel/ingest`, Header Auth (`Hotel Webhook Secret`), respond via *Respond to Webhook* | The only entry point; rejects requests without `x-hotel-secret` |
| `Download PDF` | `n8n-nodes-base.httpRequest` (4.5) | `GET {{ $json.body.file_url }}`, Header Auth `x-hotel-secret`, response format **File**, output property `data` | Fetches the file from the API's internal route (`/internal/*`, not proxied by nginx). Binary, so no base64 round trip |
| `Postgres PGVector Store` | `@n8n/n8n-nodes-langchain.vectorStorePGVector` (1.3) | mode **insert**, table `chunks`, default columns `id, text, metadata, embedding`, credential `Hotel Postgres` | Writes into the pre-created `chunks` table (LangChain layout; do not rename columns) |
| `Default Data Loader` | `@n8n/n8n-nodes-langchain.documentDefaultDataLoader` (1.1) | binary, loader `pdfLoader`, binary key `data`; metadata `document_id` and `filename` taken from the Webhook body | Stamps every chunk with `document_id`; retrieval and purge both filter on it |
| `Recursive Character Text Splitter` | `@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter` (1) | `chunkSize 1000`, `chunkOverlap 150` | Overlap keeps a sentence that straddles a boundary retrievable from either chunk |
| `Embeddings OpenAI` | `@n8n/n8n-nodes-langchain.embeddingsOpenAi` (1.2) | model `text-embedding-3-small` (1536 dims), credential `OpenAI account`, retry on fail: 3 tries, 2 s wait | Must match `vector(1536)` in the schema. Retries absorb transient OpenAI errors |
| `Purge old vectors` | `n8n-nodes-base.postgres` (2.8) | `DELETE FROM chunks WHERE metadata->>'document_id' <> $1` (`executeOnce`) | Runs **after** the new chunks are inserted, so a failed ingest never leaves the knowledge base empty |
| `Count chunks` | `n8n-nodes-base.postgres` (2.8) | `SELECT count(*)::int AS chunk_count FROM chunks WHERE metadata->>'document_id' = $1` | Reports how many chunks the document produced |
| `Respond to Webhook` | `n8n-nodes-base.respondToWebhook` (1.5) | JSON `{ ok: true, document_id, chunk_count }` | Response the API stores on the document row |

Any node error makes n8n return HTTP 500; the API then marks the document `failed` and answers `502 INGEST_FAILED`
(the previously active document stays active).

## WF2 `02-chat-answer` (path `hotel/chat`)

```
Webhook → Extract (Set) → Postgres PGVector Store [Get Many, top 6, filter document_id] (+ Embeddings OpenAI)
        → Build context (Code) → Has context? (IF n_chunks > 0)
              ├─ true  → Basic LLM Chain (+ OpenAI Chat Model gpt-4.1-mini, temp 0, 600 tokens
              │                           + Structured Output Parser, auto-fix on) → Guard & finalize
              └─ false ───────────────────────────────────────────────────────────→ Guard & finalize
        → Respond to Webhook { answer, category, answered, sources, model }
```

| Node | Type (typeVersion) | Key parameters | Why |
|---|---|---|---|
| `Webhook` | `n8n-nodes-base.webhook` (2.2) | `POST`, path `hotel/chat`, Header Auth | Same authentication as the other workflows |
| `Extract` | `n8n-nodes-base.set` (3.4) | `question`, `history` (array or `[]`), `document_id` from `body` | Normalises the input so later nodes can rely on the field names |
| `Postgres PGVector Store` | `@n8n/n8n-nodes-langchain.vectorStorePGVector` (1.3) | mode **load** (Get Many), `topK 6`, distance strategy `cosine`, metadata filter `document_id = {{ $json.document_id }}`, `includeDocumentMetadata` | Retrieval is scoped to the active document. No match returns nothing (see "No chunks" below) |
| `Embeddings OpenAI` | `@n8n/n8n-nodes-langchain.embeddingsOpenAi` (1.2) | `text-embedding-3-small` | Embeds the question with the same model used at ingest |
| `Build context` | `n8n-nodes-base.code` (2) | Run Once for All Items. Builds `context` (`[1] …` excerpts), `best_score`, `n_chunks`, formatted `history` | One item in, one item out, regardless of how many chunks came back |
| `Has context?` | `n8n-nodes-base.if` (2.2) | `n_chunks > 0` (strict number comparison) | Skips the LLM entirely when there is nothing to ground on |
| `Basic LLM Chain` | `@n8n/n8n-nodes-langchain.chainLlm` (1.9) | prompt = `apps/n8n/prompts/chat-system.md`, output parser on, **On Error: Continue** | Grounded answer, category and `answered` flag in one call |
| `OpenAI Chat Model` | `@n8n/n8n-nodes-langchain.lmChatOpenAi` (1.3) | `gpt-4.1-mini`, `temperature 0`, `maxTokens 600`, `timeout 20000`, `maxRetries 1`, **`responsesApiEnabled: false`** | Chat Completions API (the v1.3 default would be Responses API). Deterministic output |
| `Structured Output Parser` | `@n8n/n8n-nodes-langchain.outputParserStructured` (1.3) | manual JSON schema `{ answer: string, category: enum of 8, answered: boolean }`, **`autoFix: true`** | Enforces the shape; auto-fix asks the same model once to repair a malformed reply |
| `Guard & finalize` | `n8n-nodes-base.code` (2) | Enforces the invariants below. `SCORE_GUARD = 0` (off) | Deterministic last line of defence; the LLM never has the final word on fallbacks |
| `Respond to Webhook` | `n8n-nodes-base.respondToWebhook` (1.5) | JSON `{ answer, category, answered, sources, model }` | Shape mirrors the API contract §4 |


- **Prompt sync.** `apps/n8n/prompts/chat-system.md` is the source of truth for the wording. n8n cannot read
  the file at runtime, so its text is embedded in the *Basic LLM Chain* node's prompt, with
  `{{ context }}` / `{{ history }}` / `{{ question }}` replaced by
  `{{ $('Build context').first().json.<field> }}`. **Edit both together**: if you change the `.md`, paste the
  same text into the node (or edit the JSON) and re-export. Quick check that they still match:
  ```bash
  diff <(jq -r '.nodes[]|select(.name=="Basic LLM Chain").parameters.text' apps/n8n/workflows/02-chat-answer.json \
         | sed -e '1s/^=//' -e "s/{{ \$('Build context').first().json.\([a-z]*\) }}/{{ \1 }}/") apps/n8n/prompts/chat-system.md
  ```
  The Structured Output Parser appends its own format instructions after the prompt; with node v1.3 the model
  must return `{"output": {answer, category, answered}}`. *Auto-fix* is enabled (same chat model), so a reply
  that ignores the wrapper (e.g. the flat JSON the prompt's last rule describes) is repaired by one extra call.
- **No chunks → no LLM call.** When retrieval returns nothing (unknown / purged `document_id`) the IF node
  skips the LLM and the guard returns the canned sentence with `answered: false`, `category: "Other"`.
  (The query is still embedded once, so a missing OpenAI key fails even this path with a 500.)
- **`sources[].chunk_index`** is the retrieval rank (0 = closest). The chunk metadata written by WF1 has no
  chunk index (only `loc.lines`). `sources` is returned on fallbacks too, so the API stores the retrieval
  evidence for every turn.
- **Guard & finalize** enforces the §5 invariants: `!answered || n_chunks === 0` → canned sentence +
  `answered:false`; unknown category → `Other`; missing/invalid fields → `answered:false`, `Other`, canned;
  `answered:true` paired with the canned sentence → `answered:false`.

### Error handling decision

The *Basic LLM Chain* runs with **On Error: Continue (regular output)**, so failures arrive at *Guard & finalize*
as `{ error: "<message>" }`. The guard tells two kinds apart:

| Failure | Detected by | Result |
|---|---|---|
| Model output unusable (invalid JSON, wrong shape, empty) even after auto-fix | message matches `doesn't fit required format` / `empty response to the Structured Output Parser` / `Failed to parse` / `Unable to parse` | HTTP 200, canned sentence, `answered:false`, `Other`. The guest is offered the contact form. |
| OpenAI auth / quota / rate limit / network / timeout (anything else) | any other message | The guard **throws**, the execution fails, the webhook returns **HTTP 500**, and the API answers **502 `ASSISTANT_UNAVAILABLE`** (retry in the UI). |

Rationale: an outage is not a "the hotel doesn't have that information" answer. Turning it into a fallback would
wrongly offer the contact form and record an unanswered question in the stats. Embeddings and retrieval
failures are not caught at all (they also produce a 500). Verified with a fake OpenAI server: a 401 gives HTTP 500
(`LLM call failed: Authorization failed - please check your credentials`), garbage output gives the canned 200,
and an unwrapped JSON reply is recovered by auto-fix.

Timeouts: the chat model uses `timeout: 20000` and `maxRetries: 1`. The API aborts at 30 s (→ 502).

## WF3 `03-lead-email` (path `hotel/lead`)

Input: `{ "lead": { "name", "phone", "email" }, "session_id", "unanswered_question", "transcript": [{ "role", "content", "created_at" }] }`

```
Webhook → Summarize (Basic LLM Chain, + OpenAI Chat Model gpt-4.1-mini, temp 0.2)
        → Compose email (Code) → Send via Resend (HTTP Request) → Respond to Webhook { ok, email_id, summary }
```

| Node | Type (typeVersion) | Key parameters | Why |
|---|---|---|---|
| `Webhook` | `n8n-nodes-base.webhook` (2.2) | `POST`, path `hotel/lead`, Header Auth (`Hotel Webhook Secret`) | Same authentication as the other workflows |
| `Summarize` | `@n8n/n8n-nodes-langchain.chainLlm` (1.9) | system text = `apps/n8n/prompts/lead-summary.md` (plain text: SUMMARY + UNANSWERED QUESTIONS), **On Error: Continue** | If the LLM fails the email still goes out with the raw transcript |
| `OpenAI Chat Model` | `@n8n/n8n-nodes-langchain.lmChatOpenAi` (1.3) | `gpt-4.1-mini`, temperature `0.2`, credential `OpenAI account`. Uses the **Responses API** (`/v1/responses`) by default in this workflow | Cheap summarisation; Responses API is the node default in v1.3 (WF2 turns it off explicitly, see the WF2 table) |
| `Compose email` | `n8n-nodes-base.code` (2) | Builds `subject`, `html`, `text` and the Resend `payload`: lead details, summary, highlighted unanswered question, full transcript. `FROM` and `TO` are read from `${EMAIL_FROM}` / `${LEAD_TO}`. Throws if `LEAD_TO` or `EMAIL_FROM` is empty | Fails fast on bad config instead of sending to nobody. Address placeholders are substituted by `n8n-import.sh` only |
| `Send via Resend` | `n8n-nodes-base.httpRequest` (4.5) | `POST https://api.resend.com/emails`, JSON body `{{ JSON.stringify($json.payload) }}`, Header Auth `Resend` (`Authorization: Bearer …`) | Resend's REST API; `reply_to` is the guest's address so reviewers can reply directly |
| `Respond to Webhook` | `n8n-nodes-base.respondToWebhook` (1.5) | JSON `{ ok: true, email_id, summary }` | `email_id` is what the API checks; a Resend error makes this node's execution fail with HTTP 500, and the API marks the lead `emailStatus: failed` |

## Retrieval score semantics

**Finding (from the source shipped in `n8nio/n8n:2.45.5`): the PGVector *Get Many* `score` is the raw pgvector
cosine DISTANCE. Lower = more similar.**

- `@n8n/ai-utilities` `loadOperation.js` returns `{ document, score }` exactly as produced by
  `vectorStore.similaritySearchVectorWithScore(...)`, with no transformation.
- n8n's `VectorStorePGVector.node.js` passes only `distanceStrategy` (default `cosine`). It never sets
  `scoreNormalization`.
- `@langchain/community@1.1.27` `vectorstores/pgvector.js`: `scoreNormalization = config.scoreNormalization ?? "distance"`.
  The query is `SELECT *, embedding <=> $1 AS "_distance" … ORDER BY "_distance" ASC`, and
  `convertDistanceToScore(d)` returns `d` unchanged in `"distance"` mode. The similarity conversion
  `(2 - d) / 2` is used only when `scoreNormalization: "similarity"`, and n8n doesn't set that.
- So the cosine `score` lies in `[0, 2]`: `0` = identical, `1` = orthogonal (`score = 1 - cosine_similarity`).
  Results arrive sorted ascending, which makes `sources[0]` the best match and `best_score = min(score)`.
- Empirical check (wiring test with deterministic fake embeddings): the matching chunk always came back
  first with the **lowest** score (e.g. 0.31 for the check-in chunk vs 0.80+ for unrelated ones).

**Score guard.** `const SCORE_GUARD = 0;` at the top of the *Guard & finalize* code is **off**. When set to
`> 0`, it is a **maximum distance**: an `answered:true` reply whose `best_score > SCORE_GUARD` becomes the
fallback. Category `Other` (greetings and small talk, which never retrieve close chunks) is exempt.

**Suggested threshold:** keep `SCORE_GUARD = 0` and let the grounded prompt decide. The guard is only a
safety net against hallucinated answers on far-off retrievals. If you enable it, use a loose cutoff around
**0.75**. See the calibration below.

**Calibration (real `text-embedding-3-small`, sample PDF, 24 chunks, 2026-10-29, `chat-eval.spec.ts`):**

| Group | `best_score` values (cosine distance) |
|---|---|
| expected answered (6) | 0.281 · 0.341 · 0.396 · 0.438 · 0.476 · 0.591 |
| expected unanswered (4) | 0.579 · 0.607 · 0.717 · 0.813 |

The groups **do not separate**: the worst answered question ("Are pets allowed?", 0.591) is farther than the best
unanswered one ("Does the hotel have a casino?", 0.579). A distance cutoff can't tell them apart, so
`SCORE_GUARD` stays `0`. The grounded prompt alone scored 10/10 on `answered`. If you want a pure safety net
against wild retrievals, `0.75` is the loosest cutoff that keeps every answerable question in this set.
>
> | group | best_score values (cosine distance) |
> |---|---|
> | expected answered (6) | _TBD_ |
> | expected unanswered (4) | _TBD_ |

## Credentials

Created by `n8n-import.sh` from [`credentials.template.json`](credentials.template.json). The `${VAR}`
placeholders are filled with `envsubst` from `.env`. The filled file is streamed straight into the container
(`/tmp/hotel-import`, mode 700) and is never written to the host. Fixed credential ids, referenced by the workflows:

| Credential id | Name in n8n | Type | Filled from `.env` | Used by |
|---|---|---|---|---|
| `cred-openai` | `OpenAI account` | OpenAI API (`https://api.openai.com/v1`) | `OPENAI_API_KEY` | WF1 Embeddings, WF2 Embeddings + Chat Model, WF3 Chat Model |
| `cred-postgres` | `Hotel Postgres` | Postgres (host `postgres`, port 5432, SSL disabled inside the compose network) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | WF1 vector store and SQL nodes, WF2 vector store |
| `cred-webhook-secret` | `Hotel Webhook Secret` | Header Auth: header `x-hotel-secret` | `N8N_WEBHOOK_SECRET` | All three Webhook nodes; WF1 *Download PDF* |
| `cred-resend` | `Resend` | Header Auth: `Authorization: Bearer …` | `RESEND_API_KEY` | WF3 *Send via Resend* |

The API has its own copy of the webhook secret (`N8N_WEBHOOK_SECRET` in the `api` service). It must equal the
value imported here.

## How the API calls the webhooks

- Base URL: `N8N_BASE_URL=http://n8n:5678` inside compose. Calls go to `http://n8n:5678/webhook/hotel/<name>`
  (`ingest`, `chat`, `lead`) with the header `x-hotel-secret: <N8N_WEBHOOK_SECRET>`.
- The call stays on the Docker network. The Cloudflare Tunnel is never involved; only the n8n *editor* is exposed
  through it (`n8n.<domain>`).
- The API aborts the chat call after 30 s and answers `502 ASSISTANT_UNAVAILABLE`.
- `N8N_MOCK=1` replaces these calls with an in-process mock (no n8n, no OpenAI), used by `pnpm e2e` (mock mode).
- `/internal/*` routes on the API (including the PDF file that WF1 downloads) are not proxied by nginx and require the
  same header.

You can call a workflow directly the same way (the lead test does this):

```bash
curl -X POST http://localhost:5678/webhook/hotel/chat \
  -H 'Content-Type: application/json' -H "x-hotel-secret: $N8N_WEBHOOK_SECRET" \
  -d '{"question":"What time is check-in?","document_id":"<uuid>","history":[]}'
```

## Import (`apps/n8n/scripts/import.sh`)

Prerequisites: the stack is running (`docker compose up -d postgres n8n`), the n8n
owner account has been created once in the UI (http://localhost:5678), and `.env` exists with the keys filled.

```bash
pnpm n8n:import                            # dev: compose.yml + compose.override.yml
bash apps/n8n/scripts/import.sh --prod     # VPS: compose.yml only (or: pnpm --filter n8n import:prod)
COMPOSE_FILES="compose.yml" ENV_FILE=.env bash apps/n8n/scripts/import.sh   # explicit override
```

- Runs from any working directory (it `cd`s to the repo root). Use Git Bash on Windows; it sets `MSYS_NO_PATHCONV=1`
  so `/tmp/...` paths are not rewritten.
- Needs `docker`, `jq` and `envsubst` on the host.
- Warns (does not fail) when `OPENAI_API_KEY` or `RESEND_API_KEY` is empty. The credentials are then imported empty,
  and the chat or lead flows fail until you fill `.env` and re-run.
- Fails when `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` or `N8N_WEBHOOK_SECRET` is empty.
- In `03-*.json` only, `${EMAIL_FROM}` and `${LEAD_TO}` are substituted (values JSON-escaped). Other files are copied as-is.
  `LEAD_TO` is a comma-separated list.
- Steps: credentials → `n8n import:credentials` → stage each workflow → `n8n import:workflow --separate` →
  `n8n publish:workflow --id=<id>` for each workflow → remove the temp files → restart n8n → wait for `/healthz` →
  verify with `n8n list:workflow --active=true --onlyId`.
- **Activation on n8n 2.x.** `update:workflow --active` is deprecated, so the script uses `publish:workflow`. Every
  imported workflow must be active, or its webhook returns 404.
- Idempotent: the ids are fixed, so a re-run overwrites the workflows and credentials in place.

## Export (after editing in the n8n UI)

The files in `apps/n8n/workflows/` are the source of truth. Edit in the UI, then re-export:

```bash
docker compose exec -T n8n n8n export:workflow --all --separate --output=/tmp/wf
docker compose cp n8n:/tmp/wf/. apps/n8n/workflows/
```

Then rename the exported files to the canonical names `01-ingest-pdf.json`, `02-chat-answer.json` and
`03-lead-email.json`. The container's `/import` mount is read-only, so the export goes to `/tmp` first.

Before you commit:

- **Re-exported WF3 contains the substituted addresses** (from `.env`) in the `Compose email` code node. Restore the
  placeholders `${EMAIL_FROM}` and `${LEAD_TO}` there, so no real address enters git. Use `git diff` to check.
- Check that every file still has a top-level `"id"`, and that `"active"` is not used as a reason to change
  anything. Activation is handled by the import script.
- If you change `apps/n8n/prompts/*.md`, update the node text as well (see the prompt sync check in the WF2 section).

## Changing the OpenAI model

- **Chat model (WF2 and WF3).** Change the `model` value of the `OpenAI Chat Model` nodes (`gpt-4.1-mini`) in
  `02-chat-answer.json` and `03-lead-email.json`, or change it in the UI and re-export. Re-run the chat eval
  afterwards (`pnpm e2e:real`), because the category and `answered` behaviour depends on the model.
- **Embedding model (WF1 and WF2).** Change `model` in `Embeddings OpenAI`. **Dimensions must stay 1536** to match
  `vector(1536)` in `migrations/01-schema.sql`. Otherwise the schema has to change too. Any model change also needs a
  **full re-ingest** of the document, because existing vectors are not comparable to the new model's vectors.
- Do not switch WF2's chat model to the Responses API. `responsesApiEnabled: false` is deliberate there.

## Changing the email provider

The lead email is one HTTP request plus the payload builder:

1. `Compose email` (code node in WF3): builds the Resend-shaped `payload` (`from`, `to`, `reply_to`, `subject`,
   `html`, `text`). Change the shape here.
2. `Send via Resend` (HTTP Request node): URL, auth and body. Replace the URL and the `Resend` credential
   (Header Auth) for another provider's REST API. Keep the response's `id` so the `Respond to Webhook` node
   can return `email_id`.
3. `credentials.template.json`: change the `Resend` entry (name, `header`, `value`) and the env var it reads.
4. `.env.example` and `.env`: rename `RESEND_API_KEY`, then re-run `pnpm n8n:import`.

Also update the API if the response id field changes, and rerun `pnpm e2e:real` (the lead tests skip an empty
`LEAD_TO` and the reviewer addresses, so point it at your own test inbox).

## Re-pinning `N8N_VERSION`

`N8N_VERSION` in `.env` (and the template `.env.example`) is the only place the image tag is set. Never use `latest`.

1. Check the release notes for the target version, and that `publish:workflow` and `import:workflow --separate` still
   exist in it.
2. Edit `N8N_VERSION` in `.env` and `.env.example`.
3. Pull and recreate: `docker compose up -d --build n8n`
   (or `pull n8n` first).
4. Run `pnpm n8n:import` again and confirm the activation line for all three ids.
5. Run `pnpm test` (workflow contract checks) and `pnpm e2e:real` (with your own inbox in `LEAD_TO`).

## Tests

- `pnpm --filter n8n test` (Vitest, `test/workflows.test.ts`, no n8n needed): the three files parse and have fixed ids,
  each webhook is `hotel/*` with header auth, no inline API keys, the Structured Output Parser enum and the Guard
  constants match `apps/api/src/lib/categories.ts`, the WF2 prompt matches `prompts/chat-system.md` (the sync check
  above, automated), `03-*` keeps the `${EMAIL_FROM}` / `${LEAD_TO}` placeholders, and every credential a node
  references exists in `credentials.template.json`.
- `pnpm e2e:real` runs `e2e/tests/real/chat-eval.spec.ts`, which posts `docs/sample/questions.json` straight to the
  WF2 webhook. It prints question, expected, actual, category and `best_score` as a table, then asserts at least 9 of
  10 answered flags match, that `hi there!` gives `answered=true` with `Other`, and that a random `document_id` gives
  the canned sentence. It is skipped when the API runs in mock mode.
- The same run includes `e2e/tests/real/lead.spec.ts`, which posts a fake lead to WF3. It is skipped when
  `LEAD_TO` is empty or contains a reviewer address, and passes when the response has `ok: true` and a non-empty
  `email_id`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Webhook returns **404** | The workflow is not active. In n8n 2.x a workflow needs `publish:workflow`, and n8n must be restarted to register the webhook | Run `pnpm n8n:import`. Check with `n8n list:workflow --active=true --onlyId` (inside the container) |
| Webhook returns **403** | `x-hotel-secret` does not match the *Hotel Webhook Secret* credential | Compare `N8N_WEBHOOK_SECRET` in `.env` (the API uses the same value) and re-run the import script. Do not paste the secret into the README or issues |
| Chat returns **empty retrieval** (`n_chunks = 0`, canned sentence) | No chunks match the `document_id` (the active document was purged, not yet ingested, or ingest failed) | Check the document status in the admin page. Re-upload the PDF. Verify with `SELECT metadata->>'document_id', count(*) FROM chunks GROUP BY 1;` in Postgres |
| Chat returns **502** `ASSISTANT_UNAVAILABLE` | WF2 failed with a non-format error: OpenAI key missing or wrong, quota, rate limit, network or timeout (n8n returns 500) | Check the `OpenAI account` key and the n8n execution log at `https://n8n.<domain>` (or `http://localhost:5678` in dev). Retry in the UI |
| Upload returns **502** `INGEST_FAILED` | WF1 failed (download, PDF parsing, or embeddings) | Open the failing execution in the n8n Executions list to see which node failed |
| Lead returns `emailStatus: failed` | WF3 failed, usually Resend key wrong, sender domain not verified in Resend, or `LEAD_TO` / `EMAIL_FROM` empty (`Compose email` throws) | Check `RESEND_API_KEY`, `EMAIL_FROM` and `LEAD_TO` in `.env`, re-run the import script, then `lead.spec.ts` |
| `Basic LLM Chain` says the output "doesn't fit required format" | Model reply is malformed even after auto-fix | Expected to resolve to the canned sentence (HTTP 200). If it happens often, check the prompt and the model |
| Import warns `OPENAI_API_KEY is EMPTY` | `.env` has no key | Fill the key and re-run. The credential was imported empty |
| Import fails with `… is empty in .env` | A required variable is missing | Fill the variable in `.env` (CRLF line endings are tolerated) |
