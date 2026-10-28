# S4 — Realtime hardening, polish, docs

- Budget: ≤ 2 h · Target done: 04:00 PHT
- Goal: the full stack is robust in real mode, the UI is polished, and the documentation deliverables exist.
- Gate:
    - `bash infra/scripts/smoke.sh --base http://localhost:8080` passes 3 times in a row (real mode)
    - `pnpm typecheck && pnpm build`
    - `test -f docs/PDF-PROCESSING.md && test -f docs/ADMIN-DASHBOARD.md && test -f docs/RUNBOOK.md && grep -q mermaid docs/ARCHITECTURE.md`
    - `docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml logs api --since 10m | grep -ci "unhandled\|FATAL"` prints 0
- Commit on pass: `S4: polish + docs`. Then push to GitHub (S5-01 creates the repo; if it already exists, push now).

Parallelism: S4-01, S4-02, S4-03 all concurrently (disjoint owns).

---

### S4-01 · Full-stack real-mode review and hardening
- model: opus 5.5
- depends_on: [S2 gate, S3 gate]
- human: false
- owns:
    - apps/api/**
    - n8n/workflows/**
    - n8n/prompts/**
    - infra/scripts/smoke.sh
    - infra/scripts/chat-eval.sh
- may_read: [**]
- acceptance:
    - pnpm --filter api typecheck
    - bash -c 'for i in 1 2 3; do bash infra/scripts/smoke.sh --base http://localhost:8080 || exit 1; done'
    - bash infra/scripts/chat-eval.sh
- scope: |
    Exercise the real stack and fix what breaks. Checklist: (a) grounding edge cases — greeting, thanks, follow-up ("how much is that?"
    after a room question), multi-part question, a non-English question, a question whose answer spans two chunks — adjust prompt / limit if
    needed and keep `chat-eval.sh` ≥ 9/10; (b) SSE through nginx — confirm `event: stats` arrives < 1 s after a message, heartbeat every
    20 s, reconnect after `docker compose restart api`; (c) document replacement — upload a second PDF, confirm old chunks purged, old file
    deleted, answers change; (d) NO_DOCUMENT path with an empty DB; (e) two concurrent chats; (f) add `@fastify/rate-limit`
    (60 req/min/IP, exempt `/api/admin/stats/stream`); (g) request logging with request ids, no secrets in logs; (h) graceful shutdown
    (SIGTERM closes SSE connections and the pool). Re-export workflows if you changed them in the UI. List every change in the report.

### S4-02 · UI polish (droppable)
- model: sonnet 5.5
- depends_on: [S3 gate]
- human: false
- owns:
    - apps/web/**
- may_read: [docs/ARCHITECTURE.md, .claude/CLAUDE.md]
- acceptance:
    - pnpm --filter web typecheck
    - pnpm --filter web build
- scope: |
    Polish without changing behaviour: consistent spacing / typography, hover and focus-visible styles, aria labels on icon buttons,
    `prefers-reduced-motion` respected, favicon + meta description + OG title, styled 404 page, smooth scroll-to-bottom in chat, message
    timestamps on hover, empty state for the admin chart ("No questions yet"), loading skeletons, mobile layout at 375 px (composer sticks to
    the bottom, admin cards stack), subtle entrance transition for new bubbles. Quick manual contrast check. No new dependencies.

### S4-03 · Documentation deliverables
- model: haiku 5.5
- depends_on: [S2-05]
- human: false
- owns:
    - docs/ARCHITECTURE.md
    - docs/PDF-PROCESSING.md
    - docs/ADMIN-DASHBOARD.md
    - docs/RUNBOOK.md
    - README.md
- may_read: [**]
- acceptance:
    - bash -c 'for f in docs/ARCHITECTURE.md docs/PDF-PROCESSING.md docs/ADMIN-DASHBOARD.md docs/RUNBOOK.md; do test -s $f || exit 1; done; grep -q "mermaid" docs/ARCHITECTURE.md'
    - bash -c 'grep -ohE "\]\((docs|n8n|infra|apps|sprints)/[^)#]+" README.md docs/*.md | sed "s/^](//" | sort -u | while read p; do test -e "$p" || { echo "broken link: $p"; exit 1; }; done'
- scope: |
    The task's documentation deliverables (evaluation criterion "Documentation: clear and reproducible"). Keep the `docs/ARCHITECTURE.md`
    contracts intact; add at the top a Mermaid diagram (browser → cloudflared → nginx → api → n8n → OpenAI / Postgres / Resend) and a short
    "Chosen technologies and why" prose section. `docs/PDF-PROCESSING.md`: upload → internal download → Data Loader → splitter (1000/150) →
    embeddings → pgvector insert → purge; retrieval (top-6, metadata filter) → grounding prompt → structured output → guard; why answers can
    only come from the PDF; how "I don't know" is decided. `docs/ADMIN-DASHBOARD.md`: dashboard design, stat definitions (what counts as a
    session), data flow message → DB → event → SSE → chart, polling fallback. `docs/RUNBOOK.md`: prerequisites, local run (both modes), env
    table, n8n first-run + import, smoke test, deploy to VPS (`deploy.sh`, tunnel), extending (new category: 4 places to change; swap LLM;
    swap email provider; re-export workflows), troubleshooting. Final `README.md`: pitch, screenshot placeholders, links to all docs, quickstart.
