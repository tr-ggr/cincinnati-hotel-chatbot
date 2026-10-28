# PDF processing and grounded answers

How the hotel's PDF becomes searchable vectors, how a guest question is answered from them, and how the
"I don't know" path is decided. Contracts and exact node settings live in [`ARCHITECTURE.md`](ARCHITECTURE.md) §4 and §5;
the node-by-node reference is [`../n8n/README.md`](../n8n/README.md).

## 1. Ingestion: upload to purge

Only one document is active at a time. Uploading a new PDF replaces the old one once the new one is fully embedded.

```
Admin uploads PDF
  │
  ▼
API  POST /api/admin/document  (multipart, field "file", max 25 MB)
  1. Check the magic bytes are "%PDF-"            → else 422 INVALID_PDF
  2. Stream the file to UPLOAD_DIR/<id>.pdf       → over the limit: 413 FILE_TOO_LARGE
  3. pdf-parse: page count and extractable text   → unparsable: 422 INVALID_PDF
     Text under 200 characters (whitespace removed) → 422 EMPTY_PDF (scanned or blank); file deleted
  4. INSERT documents row: status 'processing', is_active false
  │
  ▼
API  calls WF1 hotel/ingest  { document_id, filename, file_url }   timeout 180 s
  │   file_url = http://api:3000/internal/documents/<id>/file
  ▼
n8n WF1 "01-ingest-pdf"
  Webhook (x-hotel-secret)
  → Download PDF          HTTP GET of file_url, response format File (binary property "data")
  → Postgres PGVector Store, mode Insert, table chunks
        Default Data Loader   binary PDF, metadata document_id + filename
        Recursive Character Text Splitter   chunk 1000, overlap 150
        Embeddings OpenAI     text-embedding-3-small, 1536 dims (retry 3 × 2 s)
  → Purge old vectors     DELETE FROM chunks WHERE metadata->>'document_id' <> <new id>
  → Count chunks          SELECT count(*) for the new document_id
  → Respond { ok, document_id, chunk_count }
  │
  ▼
API, on success: one transaction makes the new row active (status 'ready', chunk_count set)
  and clears is_active on the previous row. The previous PDF file is deleted. stats:changed is emitted.
API, on failure: status 'failed' with the error text, the PDF file is deleted, 502 INGEST_FAILED.
  The previous document stays active.
```

### Why the purge runs last

The new vectors are inserted first and the old ones are deleted afterwards. If embedding fails halfway, the
knowledge base still holds the previous document's chunks, and the guest keeps getting answers. The reverse order
would leave the bot with nothing to answer from after any failed upload.

### Chunking and metadata

- **Splitter:** recursive character splitter, 1000 characters per chunk with 150 characters of overlap. The overlap
  keeps a sentence that straddles a boundary retrievable from either neighbouring chunk.
- **Metadata:** every chunk carries `document_id` and `filename`. Retrieval and the purge both filter on
  `metadata->>'document_id'`, and the `chunks_document_id` index serves that filter.
- **Embeddings:** `text-embedding-3-small` produces 1536-dimensional vectors, matching `vector(1536)` in
  [`infra/db/01-schema.sql`](../infra/db/01-schema.sql). The same model embeds questions at query time, so the
  two sides are comparable. Changing the model needs a full re-ingest (see [`../n8n/README.md`](../n8n/README.md#changing-the-openai-model)).
- **Sample document:** `pnpm sample:pdf` generates `docs/sample/cincinnati-hotel.pdf`, a 7-page fictional hotel
  brochure of about 18.8k characters. The smoke test and the accuracy set are written against it.

### What the pipeline does not handle

- **Scanned PDFs** have no text layer, so they are rejected with `EMPTY_PDF` before any n8n call. OCR is out of scope.
- **Tables and images** are read as whatever text the PDF exposes. Layout is not reconstructed, so values in
  complicated tables may come out in an odd order. The sample uses plain sections for this reason.
- **Chunk indexes:** the chunk metadata written by WF1 has no chunk index, only the line location. The `sources`
  returned by WF2 use retrieval rank instead (see below).

## 2. Answering a question

```
Guest message  →  API  POST /api/sessions/:id/messages
  1. Validate (1..2000 characters), load session, load active 'ready' document (else 409 NO_DOCUMENT)
  2. INSERT the user message (category and answered still null)
  3. Build history: last 8 messages before this one, as { role, content }
  4. Call WF2 hotel/chat  { session_id, message_id, question, document_id, history }   timeout 30 s
  │
  ▼
n8n WF2 "02-chat-answer"
  Webhook → Extract (Set)
  → Postgres PGVector Store, mode Get Many
        top 6 by cosine distance
        metadata filter: document_id = active document          (+ Embeddings OpenAI for the question)
  → Build context (Code)      "[1] …", "[2] …" excerpts; best_score; n_chunks; history as Guest/Assistant lines
  → Has context? (IF n_chunks > 0)
        false → skip the LLM
        true  → Basic LLM Chain  (grounding prompt, gpt-4.1-mini, temperature 0, Chat Completions API,
                                  Structured Output Parser with autoFix)
  → Guard & finalize (Code)   enforces the invariants below
  → Respond { answer, category, answered, sources, model }
  │
  ▼
API: store category and answered on the user message, insert the assistant message (with sources and latency_ms),
  touch the session, emit stats:changed. Response: userMessage, assistantMessage, offerContactForm = !answered.
```

### Retrieval

- **Scope.** The query filters on the active document's `document_id`. A chunk from an old or purged document can
  never be returned.
- **Size.** The top 6 chunks by cosine distance go into the prompt. Results come back sorted, so `sources[0]` is the
  closest match.
- **Score.** The PGVector `score` is pgvector's cosine **distance**: `0` is identical, `1` is orthogonal, and lower
  is better. `best_score` is the minimum of the six. The reasoning and the workflow source references are in
  [`../n8n/README.md`](../n8n/README.md#retrieval-score-semantics).
- **Sources.** Returned as `{ chunk_index, score }`, where `chunk_index` is the retrieval rank (0 is closest). The
  API stores them with every assistant reply, including fallbacks, so each answer's evidence can be inspected later.

### Grounding prompt

The prompt lives in [`../n8n/prompts/chat-system.md`](../n8n/prompts/chat-system.md) and is embedded in the
*Basic LLM Chain* node. The rules, in short:

1. Use only facts in the excerpts. No outside knowledge, no guessing, no invented prices, times, names or policies.
2. If the excerpts answer the question fully or partly, answer concisely (about 120 words at most), prefer exact
   numbers and times from the text, and set `answered: true`.
3. If the excerpts do not contain what is needed, set `answered: false` and use the exact canned sentence:
   *"I'm sorry, I don't have that information right now."*
4. Greetings and small talk get a short, warm reply, `answered: true`, category `Other`.
5. Classify the question into exactly one of the eight categories.
6. The conversation history is used only to resolve references such as "how much does it cost?". It is never a source
   of facts.

The model returns `{"answer", "category", "answered"}`. The Structured Output Parser enforces that shape. The API
never talks to OpenAI, so the prompt stays inside the workflow where it can be reviewed.

## 3. Why answers can only come from the PDF

The guarantee is layered, so no single layer has to be perfect:

1. **Retrieval is the only source of context.** The model never sees the whole document or any other knowledge
   base. It sees at most six excerpts from the active document.
2. **No excerpts, no model call.** If the retrieval returns nothing, the `Has context?` branch skips the LLM
   altogether and the guard returns the canned sentence. The model cannot answer from memory in that case.
3. **The prompt forbids outside facts,** and the history is labelled as non-authoritative for facts.
4. **The guard has the last word.** It rewrites any answer to the canned sentence when the model says
   `answered: false` or when there are no chunks, and it refuses an answer that is `answered: true` but carries the
   canned text. The deterministic code, not the model, decides the final fallback.
5. **Optional score guard.** It can reject answers whose best retrieval distance is above a threshold. It is off by
   default (`SCORE_GUARD = 0`) because the threshold has not been calibrated yet (see the TODO in `n8n/README.md`).

Known limit: the grounding is only as good as the model's compliance with rule 1. The accuracy set in
[`sample/questions.json`](sample/questions.json) (six answerable and four unanswerable questions) is the check for
that. The acceptance bar is at least 9 of 10 `answered` flags correct, run with `bash infra/scripts/chat-eval.sh`.

## 4. How "I don't know" is decided

There are four ways a question ends up with `answered: false`. Each one is visible in the workflow:

| Path | Trigger | Result |
|---|---|---|
| No relevant excerpts | retrieval returns 0 chunks (`n_chunks = 0`) | LLM skipped. Canned sentence, `answered: false`, category `Other` |
| Model says it lacks the information | the model returns `answered: false` | Guard keeps the canned sentence (it replaces whatever text the model wrote), `answered: false`, category from the model |
| Model output unusable | the parser fails even after auto-fix, or the reply is missing fields | Canned sentence, HTTP 200, `answered: false`, category `Other` |
| Model says it answered, but the text is the canned sentence | `answered: true` and `answer` equals the canned text | Guard forces `answered: false` |

Two things are deliberately **not** "I don't know":

- **Infrastructure failures.** OpenAI auth, quota, rate limit, network error or timeout make WF2 fail with HTTP 500.
  The API answers `502 ASSISTANT_UNAVAILABLE`, the user message stays in the transcript, the UI offers a retry, and the
  contact form is **not** offered. Recording an outage as an unanswered question would inflate the "Unanswered"
  statistic and push guests toward a contact form for no reason.
- **Greetings and small talk.** These are `answered: true` with category `Other`, so they do not count as unanswered.

When `answered` is false, the API returns `offerContactForm: true`. The UI then shows the contact form after the
canned sentence, and the admin dashboard counts the question as unanswered.

## 5. Categories

Every user message is classified into one of eight categories by the same LLM call that writes the answer. The list
is fixed in four places that must stay identical: `apps/api/src/lib/categories.ts`, `apps/web/src/lib/categories.ts`,
the `CHECK` constraint in `infra/db/01-schema.sql`, and the Structured Output Parser schema in
`n8n/workflows/02-chat-answer.json`. The RUNBOOK lists the steps for adding a category.

## 6. Verifying the pipeline

| Check | Command | Expected |
|---|---|---|
| Mock path (no keys) | `bash infra/scripts/smoke.sh --base http://localhost:8080 --mock` | `SMOKE PASS (mode=mock …)`; upload reports 42 chunks |
| Real ingest | upload `docs/sample/cincinnati-hotel.pdf` in `/admin` | status `ready`, chunk count above 10 |
| Real answers | `bash infra/scripts/chat-eval.sh` | at least 9 of 10 `answered` flags match; `hi there!` answers with `Other`; a random `document_id` gets the canned sentence |
| End to end | `bash infra/scripts/smoke.sh --base http://localhost:8080` | `SMOKE PASS` |

Operational checks for n8n are in [`../n8n/README.md`](../n8n/README.md#troubleshooting).
