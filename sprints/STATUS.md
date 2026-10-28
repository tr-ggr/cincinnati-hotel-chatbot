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
| S2-01 | opus 5.5 | todo | 0 | |
| S2-02 | opus 5.5 | todo | 0 | |
| S2-03 | sonnet 5.5 | todo | 0 | |
| S2-04 | sonnet 5.5 | todo | 0 | |
| S2-05 | haiku 5.5 | todo | 0 | |
| S2 gate | — | todo | 0 | |
| S3-01 | sonnet 5.5 | todo | 0 | |
| S3-02 | sonnet 5.5 | todo | 0 | |
| S3-03 | sonnet 5.5 | todo | 0 | |
| S3-04 | haiku 5.5 | todo | 0 | droppable |
| S3 gate | — | todo | 0 | |
| S4-01 | opus 5.5 | todo | 0 | |
| S4-02 | sonnet 5.5 | todo | 0 | droppable |
| S4-03 | haiku 5.5 | todo | 0 | |
| S4 gate | — | todo | 0 | |
| S5-01 | human | todo | 0 | |
| S5-02 | opus 5.5 + human | todo | 0 | |
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
