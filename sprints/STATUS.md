# Sprint status

Maintained by the orchestrator. One row per card. States: `todo` · `running` · `passed` · `failed(n)` · `blocked-human` · `skipped(reason)`.

| Card | Model | State | Attempts | Note |
|---|---|---|---|---|
| S0-01 | haiku 5.5 | passed | 1 | git init main; pnpm allowBuilds esbuild; root TS ^7 |
| S0-02 | haiku 5.5 | passed | 1 | api TS 7 ok; pdf-parse v2; pnpm deploy --legacy |
| S0-03 | haiku 5.5 | passed | 1 | web TS pinned ^5.9 (typescript-eslint); nginx resolver + /internal 404 |
| S0-04 | sonnet 5.5 | passed | 1 | N8N_VERSION=2.45.5; dropped deprecated N8N_RUNNERS_ENABLED |
| S0-H1 | haiku 5.5 | passed | 1 | handoff from S0-04: .gitattributes + ARCHITECTURE §7 runners line |
| S0-05 | haiku 5.5 | passed | 1 | 7 pages, ~18.8k chars text; no Location question (6 sections covered) |
| S0-06 | human | blocked-human | 0 | instructions printed 2026-10-28 |
| S0 gate | — | passed | 2 | all 4 services up, health ok, typecheck ok |
| S0-FIX | opus 5.5 | passed | 2 | API_HOST_PORT (local 3001); healthchecks use 127.0.0.1 (alpine localhost→::1) |
| S1-01 | sonnet 5.5 | passed | 1 | db-check run on localhost:5433 (native pg on 5432) |
| S1-H1 | haiku 5.5 | passed | 1 | POSTGRES_HOST_PORT configurable (local 5433) |
| S1-02 | sonnet 5.5 | passed | 1 | exports RouteDeps, sendError; POST /api/sessions needs body {} if content-type json (note for S3-01) |
| S1-03 | sonnet 5.5 | passed | 1 | pdf-parse v2 works on alpine; mock upload 7 pages/42 chunks; SSE ok |
| S1-04 | haiku 5.5 | passed | 1 | mock smoke 7/7 PASS |
| S1 gate | — | passed | 1 | mock smoke PASS, typecheck ok |
| S2-01 | opus 5.5 | passed | 2 | real ingest: 7 pages → 24 chunks (text-embedding-3-small) |
| S2-02 | opus 5.5 | passed | 2 | real chat-eval 10/10, greeting + unknown doc ok; scores not separable → SCORE_GUARD stays 0 (README table filled) |
| S2-03 | sonnet 5.5 | passed | 2 | real lead-test: Resend email sent to user's test inbox, LLM summary ok |
| S2-04 | sonnet 5.5 | passed | 2 | real smoke 8/8 PASS with N8N_MOCK=0 |
| S2-05 | haiku 5.5 | passed | 1 | 310-line README; score TODO table kept |
| S2 gate | — | passed | 1 | import exit 0, 3 active, real smoke PASS, export == repo (only ${EMAIL_FROM}/${LEAD_TO} placeholders differ) |
| S3-01 | sonnet 5.5 | passed | 1 | lib/index + components/ui/index barrels; categories identical |
| S3-02 | sonnet 5.5 | passed | 1 | verified live at 375px via playwright-cli; bundle 716kB (code-split idea for S4-02) |
| S3-03 | sonnet 5.5 | passed | 1 | live check ok (Live badge, +1 within 2s, upload via UI) |
| S3-04 | haiku 5.5 | passed | 1 | 2/2 specs pass (E2E_BASE_URL=http://[::1]:8080) |
| S3 gate | — | passed | 1 | e2e 2/2, no console errors, 375+1280px ok, admin 4 cards+chart+Live |
| S4-01 | opus 5.5 | blocked-human | 1 | part 1 done (b,d,e,f,g,h verified mock: SSE 10ms, ping 20s, reconnect ok, 409 ok, concurrency ok, rate-limit 60/10, reqIds, redaction, shutdown 0.55s); a,c need keys |
| S4-02 | sonnet 5.5 | passed | 1 | route code-split (no chunk warning), AA accent #b45309, e2e 2/2, 375/1280 ok |
| S4-03 | haiku 5.5 | passed | 1 | 4 docs + README; links ok; mermaid added |
| S4-H1 | haiku 5.5 | passed | 1 | CLAUDE.md --env-file; .env.example comments; 502 emits stats; Dockerfile 127.0.0.1; ngrok note |
| S4-H2 | sonnet 5.5 | passed | 1 | ARCH §4 rate-limit text; nginx X-Request-ID; SSE recovers from polling (Live 8s after api restart); friendly 429 in chat |
| S4 gate | — | todo | 0 | |
| S5-01 | human | todo | 0 | |
| S5-02 | opus 5.5 + human | blocked-human | 1 | deploy.sh written (bash -n ok, preflight dry-runs ok); VPS deploy waits on S0-06 + S5-01 + keys |
| S5-03 | haiku 5.5 | todo | 0 | |
| S5-04 | human | todo | 0 | |

## Log

_(orchestrator appends dated one-liners here: gate results, escalations, handoffs, decisions)_

- 2026-10-28 pre-flight: jq 1.8.2 installed (~/bin). Decisions: user fills OPENAI/RESEND keys, EMAIL_FROM, LEAD_TO in .env; local n8n owner automated via REST; S5 VPS steps run by user.
- 2026-10-28 S0-04: n8n pinned 2.45.5; N8N_RUNNERS_ENABLED removed from compose (deprecated in 2.x) — discrepancy vs ARCHITECTURE §7, fixed via S0-H1.
- 2026-10-28 S0 gate failed: host :3000 used by unrelated local Next dev server (not ours, not killed). S0-FIX makes api host port configurable.
- 2026-10-28 S0 gate passed (attempt 2) → commit 'S0: scaffold'.
- 2026-10-28 S1-01: host :5432 also bound by user's native Windows postgres (not touched). S1-H1 adds POSTGRES_HOST_PORT; S1-01 db-check acceptance run with localhost:5433.
- 2026-10-28 S1 gate passed → commit 'S1: api core'.
- 2026-10-28 local n8n owner created via POST /rest/owner/setup (owner@localhost.test). Keys still empty in .env → S2-01 builds/imports now, OpenAI-dependent acceptance deferred until key filled.
- 2026-10-28 local :8080 IPv4 is held by user's Apache (httpd); our nginx answers on [::1]:8080. curl 'localhost' resolves IPv6 → smoke OK. Browser checks use http://[::1]:8080.
- 2026-10-28 S3 gate passed → commit 'S3: web'.
- 2026-10-28 S2-01: creds use fixed ids cred-*; WF ids hotelIngestPdf01 / hotelChatAnswr02 / hotelLeadEmail03; activation = n8n publish:workflow + restart (update:workflow deprecated on 2.45.5). Downstream verified with fake embeddings (24 chunks, purge ok). Blocked on OPENAI_API_KEY.
- 2026-10-28 user: "build, update status, commit, push; keys later". Built + committed. Push NOT done: no git remote, and the only gh account is a bee-man-dan account (user said not to use those) → push waits for S5-01 (user creates repo/remote).
- 2026-10-28 checkpoint commit (user asked to commit everything): S2-02..05 built + verified with fake OpenAI/Resend; S4-02, S4-03, S4-H1 passed; deploy.sh written. Remaining gates (S2, S4-01, S4) need OPENAI/RESEND keys + EMAIL_FROM + LEAD_TO; S5 needs S0-06 + a non-bee-man-dan GitHub remote.
- 2026-10-28 S4-01 part 1 (mock items) + S4-H2 passed → checkpoint commit. Remaining: S4-01 a/c, S2/S4 gates (keys), S5 (S0-06, remote, VPS).
- 2026-10-29 keys filled by user. EMAIL_FROM was a bare domain → set to `Cincinnati Hotel Assistant <concierge@mail.tristanjamestolentino.com>` (domain verified in Resend); LEAD_TO = user's own test inbox; N8N_MOCK=0.
- 2026-10-29 S2 gate passed (real mode) → commit 'S2: n8n workflows'.
