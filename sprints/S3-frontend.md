# S3 — Frontend

- Budget: ≤ 2.5 h · Target done: 02:00 PHT (runs in parallel with S2; depends only on the S1 gate — develop against the API in mock mode)
- Goal: the three pages from ARCHITECTURE §6 work against the API: landing → chat (answer, fallback + contact form) and admin (upload, live stats).
- Gate:
    - `pnpm --filter web typecheck && pnpm --filter web build`
    - `docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d --build web`
    - DOM checks at http://localhost:8080 (orchestrator uses Playwright via the `playwright-cli` skill, or S3-04's specs if they exist):
      landing shows two buttons "Admin" and "Regular User"; /chat sends "What time is check-in?" and renders a reply; "Is there a helipad on
      the roof?" renders the canned sentence and the contact form; submitting the form shows the confirmation; /admin shows 4 stat cards, the
      chart and the document card; after a chat message in another tab the admin counts change within 2 s
    - No console errors on the three pages; usable at 375 px width
- Commit on pass: `S3: web`

Parallelism: S3-01 first (alone). Then S3-02 and S3-03 concurrently. S3-04 last (droppable).

---

### S3-01 · App shell, design system, API client, landing
- model: sonnet 5.5
- depends_on: [S1 gate]
- human: false
- owns:
    - apps/web/index.html
    - apps/web/src/main.tsx
    - apps/web/src/App.tsx
    - apps/web/src/index.css
    - apps/web/src/lib/**
    - apps/web/src/components/ui/**
    - apps/web/src/pages/Landing.tsx
    - apps/web/src/pages/NotFound.tsx
- may_read: [apps/web/**, docs/ARCHITECTURE.md, .claude/CLAUDE.md, docs/sample/questions.json]
- acceptance:
    - pnpm --filter web typecheck
    - pnpm --filter web build
- scope: |
    Per ARCHITECTURE §6. `index.css`: Tailwind v4 import + `@theme` tokens (stone neutrals, amber accent, radius, shadows) — light theme,
    modern and clean. `components/ui`: Button (primary/secondary/ghost, sizes, loading), Card, Input, Textarea, Badge, Spinner, Skeleton —
    small, typed, Tailwind-only. `lib/api.ts`: typed fetch client mirroring §4 exactly (types `Message`, `StatsSnapshot`, `DocumentInfo`,
    `ApiError` with `code`), base `/api`. `lib/categories.ts`: identical 8-value tuple to the API. `lib/useStatsStream.ts`: EventSource on
    `/api/admin/stats/stream`, parses `stats` events, exposes `{ stats, mode: 'live'|'polling'|'connecting' }`, switches to 10 s polling of
    `GET /api/admin/stats` after 2 failed reconnects, cleans up on unmount. `App.tsx` routes "/", "/chat", "/admin", "*". `Landing.tsx`:
    hotel mark, title "Cincinnati Hotel Assistant", subtitle, two large cards/buttons **Admin** (ShieldCheck icon → /admin) and
    **Regular User** (MessageCircle icon → /chat), footer "Powered by n8n + OpenAI". `NotFound.tsx` minimal. Leave `Chat.tsx` and `Admin.tsx`
    as the S0 placeholders (other cards own them).

### S3-02 · Chat page
- model: sonnet 5.5
- depends_on: [S3-01]
- human: false
- owns:
    - apps/web/src/pages/Chat.tsx
    - apps/web/src/components/chat/**
- may_read: [apps/web/src/**, docs/ARCHITECTURE.md, docs/sample/questions.json]
- acceptance:
    - pnpm --filter web typecheck
    - pnpm --filter web build
- scope: |
    Per ARCHITECTURE §6 "/chat". Session bootstrap via `sessionStorage` (`hotel.sessionId`), rehydrate with `GET /api/sessions/:id`
    (on 404 create a new one). Components: `MessageList` (auto-scroll to bottom), `MessageBubble` (user right / assistant left with avatar,
    `react-markdown` for assistant, subtle category Badge), `TypingIndicator`, `Composer` (autosize textarea, Enter / Shift+Enter, disabled
    while pending), `SuggestionChips` (3 answerable questions from `docs/sample/questions.json`, e.g. check-in time, pool hours, pet policy),
    `ContactFormCard` (Name / Phone / Email with basic validation → `POST /api/leads` with `unansweredQuestion` = the user's last question →
    success state "Thanks, our team will contact you shortly."; "No thanks" dismisses). When `offerContactForm` is true, render the
    assistant's canned sentence, then a short line "Would you like to leave your contact details so our team can get back to you?" and the
    card (once per unanswered question). Error states: 409 `NO_DOCUMENT` → persistent banner; 502 → inline "Couldn't reach the assistant —
    Retry" on that message. "New conversation" button in the header. Optimistic user bubble, typing indicator until the reply arrives.
    Keep everything responsive (375 px).

### S3-03 · Admin page
- model: sonnet 5.5
- depends_on: [S3-01]
- human: false
- owns:
    - apps/web/src/pages/Admin.tsx
    - apps/web/src/components/admin/**
- may_read: [apps/web/src/**, docs/ARCHITECTURE.md]
- acceptance:
    - pnpm --filter web typecheck
    - pnpm --filter web build
- scope: |
    Per ARCHITECTURE §6 "/admin". `LiveBadge` (green dot "Live" / grey "Polling" / amber "Connecting" from `useStatsStream`).
    `UploadCard`: shows the current document from `GET /api/admin/document` (filename, pages, chunks, uploaded time, status pill) or an empty
    state; drag-drop zone + file picker (PDF only, ≤ 25 MB client check); on submit `POST /api/admin/document` with progress state
    "Uploading…" then "Processing (embedding chunks)…"; on success refresh the document; on error show the API message (`INVALID_PDF`,
    `EMPTY_PDF`, `INGEST_FAILED`). "Replace" wording when a document exists. `StatCard` ×4 (Total sessions, Questions asked, Unanswered,
    Leads captured) with lucide icons and skeletons while loading. `CategoryChart`: Recharts horizontal BarChart, all 8 categories, sorted
    desc, zeros rendered, value labels at bar end, amber bars, responsive container; visually-hidden `<table>` fallback beneath for screen
    readers. Page header: "Admin dashboard", back link to "/", LiveBadge. Grid responsive (1 column at 375 px).

### S3-04 · Playwright e2e (droppable)
- model: haiku 5.5
- depends_on: [S3-02, S3-03]
- human: false
- owns:
    - apps/web/e2e/**
    - apps/web/playwright.config.ts
- may_read: [apps/web/src/**, docs/ARCHITECTURE.md, infra/scripts/smoke.sh]
- acceptance:
    - bash -c 'cd apps/web && npx playwright install chromium >/dev/null 2>&1; pnpm e2e'
- scope: |
    Add `@playwright/test` devDependency and script `e2e` (`playwright test`), baseURL `http://localhost:8080` (stack must be running in
    mock mode). Two specs: (1) user journey — landing → "Regular User" → send "What time is check-in?" → assistant bubble appears →
    send "Is there a helipad on the roof?" → canned sentence + contact form → fill + submit → confirmation text. (2) admin realtime —
    open /admin, read the "Questions asked" value, open a second page on /chat, send a question, expect the admin value to increase within
    5 s without reload. Use role/text selectors; no new test ids beyond what exists. If this card exceeds 30 min, report and let the
    orchestrator mark it `skipped(time)`.
