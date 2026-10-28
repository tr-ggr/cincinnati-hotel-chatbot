# S0 — Scaffold & infra

- Budget: ≤ 1.5 h · Target done: 20:30 PHT
- Goal: an empty-but-running stack. Every service builds, Postgres has the schema, n8n boots, API answers `/api/health`, web serves a placeholder SPA.
- Gate (run after all cards pass):
    - `docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d --build` → postgres, n8n, api, web all `healthy`/running
    - `curl -fsS http://localhost:8080/api/health` → 200 JSON with `"ok":true`
    - `pnpm typecheck` exits 0
- Commit on pass: `S0: scaffold`

Parallelism: S0-01 first (alone). Then S0-02, S0-03, S0-04, S0-05 concurrently. S0-06 is human and can start immediately.

---

### S0-01 · Repo root
- model: haiku 5.5
- depends_on: []
- human: false
- owns:
    - .gitignore
    - .editorconfig
    - package.json
    - pnpm-workspace.yaml
    - README.md
- may_read: [docs/ARCHITECTURE.md, .claude/CLAUDE.md]
- acceptance:
    - git rev-parse --is-inside-work-tree
    - pnpm install
    - node -e "const p=require('./package.json');for(const s of ['dev','build','typecheck','lint','smoke','sample:pdf'])if(!p.scripts[s])process.exit(1)"
- scope: |
    `git init` (branch `main`). Write `.gitignore` (node_modules, dist, build, .env, .env.*, !.env.example, uploads/, n8n/credentials.json,
    coverage, playwright-report, test-results, .DS_Store, *.log). `.editorconfig` (2 spaces, LF, utf-8, final newline).
    `pnpm-workspace.yaml` with `packages: ["apps/*"]`. Root `package.json` (private, `"type":"module"`, `packageManager: pnpm@11`,
    engines node >=22) with scripts per ARCHITECTURE §2: `dev` (`pnpm -r --parallel dev`), `build` (`pnpm -r build`),
    `typecheck` (`pnpm -r typecheck`), `lint` (`pnpm -r lint`), `smoke` (`bash infra/scripts/smoke.sh`), `sample:pdf`
    (`tsx docs/sample/generate-sample-pdf.ts`). Root devDependencies: `tsx`, `pdfkit`, `@types/pdfkit`, `typescript`.
    Keep the existing README.md content; just ensure it links docs/ARCHITECTURE.md and sprints/README.md. Do NOT commit.

### S0-02 · API scaffold
- model: haiku 5.5
- depends_on: [S0-01]
- human: false
- owns:
    - apps/api/**
- may_read: [docs/ARCHITECTURE.md, .claude/CLAUDE.md, package.json]
- acceptance:
    - pnpm install
    - pnpm --filter api typecheck
    - pnpm --filter api build
    - docker build -f apps/api/Dockerfile -t hotel-api:s0 .
- scope: |
    Create `apps/api` per ARCHITECTURE §2: Fastify 5, TypeScript strict ESM (`"type":"module"`, NodeNext), `tsx watch` for `dev`,
    `tsc` for `build`, scripts `dev/build/start/typecheck/lint` (lint = `tsc --noEmit`). Dependencies: fastify, @fastify/cors,
    @fastify/multipart, pg, zod, pdf-parse; dev: typescript, tsx, @types/node, @types/pg, pino-pretty.
    `src/config.ts`: zod-parse env (PORT=3000, DATABASE_URL, N8N_BASE_URL, N8N_WEBHOOK_SECRET, N8N_MOCK ('0'|'1'),
    INTERNAL_BASE_URL, UPLOAD_DIR, MAX_UPLOAD_MB=25, NODE_ENV) — fail fast with a readable message.
    `src/index.ts`: build app, register cors + multipart (limits from config), register `routes/health.ts`
    (`GET /api/health` → `{ok:true, db:"unknown", n8n:"unknown", activeDocument:false}` for now — S1 wires the real checks),
    listen on 0.0.0.0, SIGTERM/SIGINT graceful close. Logger: pino, pretty in dev.
    Dockerfile: node:22-alpine multi-stage; install with pnpm (corepack), build, copy dist + prod node_modules, `CMD node dist/index.js`;
    `wget` is present in alpine for the healthcheck. Create `src/db`, `src/lib`, `src/routes` folders with `.gitkeep` where empty.

### S0-03 · Web scaffold
- model: haiku 5.5
- depends_on: [S0-01]
- human: false
- owns:
    - apps/web/**
- may_read: [docs/ARCHITECTURE.md, .claude/CLAUDE.md, package.json]
- acceptance:
    - pnpm install
    - pnpm --filter web typecheck
    - pnpm --filter web build
    - docker build -f apps/web/Dockerfile -t hotel-web:s0 .
- scope: |
    Create `apps/web` per ARCHITECTURE §2 and §6: Vite + React 19 + TypeScript strict + Tailwind v4 (`@tailwindcss/vite`),
    react-router v7 (`BrowserRouter`) with placeholder pages `Landing` ("/"), `Chat` ("/chat"), `Admin` ("/admin"), `NotFound` ("*").
    Scripts `dev/build/typecheck/lint/preview`. Vite dev proxy `/api` → `http://localhost:3000`. `index.css` imports tailwind and
    defines CSS tokens (stone/amber palette). `nginx.conf` exactly per §6 (SPA fallback, `/api/` proxy to `api:3000` with buffering off,
    `client_max_body_size 50m`, `/internal/` not proxied). Dockerfile: node:22-alpine build stage → `nginx:alpine` serving `dist`
    on :80 with the nginx.conf copied to `/etc/nginx/conf.d/default.conf`. Add `lucide-react`, `recharts`, `react-markdown`, `clsx`
    as dependencies now (S3 uses them). Favicon + `<title>Cincinnati Hotel Assistant</title>`.

### S0-04 · Compose, DB schema, env
- model: sonnet 5.5
- depends_on: [S0-01]
- human: false
- owns:
    - infra/**
    - .env.example
- may_read: [docs/ARCHITECTURE.md, .claude/CLAUDE.md]
- acceptance:
    - docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml config -q
    - docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml up -d postgres n8n
    - bash -c 'for i in $(seq 1 30); do docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml exec -T postgres pg_isready -U hotel -d hotel && break; sleep 2; done'
    - bash -c 'docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml exec -T postgres psql -U hotel -d hotel -c "\dt" | grep -E "documents|chunks|sessions|messages|leads"'
    - docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml exec -T postgres psql -U hotel -d hotel -c "select 1 from stats_overview"
    - bash -c 'docker compose --env-file .env -f infra/docker-compose.yml -f infra/compose.override.yml exec -T postgres psql -U hotel -lqt | grep -w n8n'
    - bash -c 'for i in $(seq 1 40); do curl -fsS http://localhost:5678/healthz && break; sleep 3; done'
- scope: |
    Write `infra/docker-compose.yml` exactly per ARCHITECTURE §7 and `infra/compose.override.yml` (dev ports + n8n http/localhost env +
    `N8N_SECURE_COOKIE=false`). Write `infra/db/00-create-n8n-db.sh` (psql `CREATE DATABASE n8n` as POSTGRES_USER, executable) and
    `infra/db/01-schema.sql` verbatim from §3. Write `.env.example` per §7 and **pin `N8N_VERSION`**: run `docker pull n8nio/n8n:latest`,
    then `docker run --rm n8nio/n8n:latest n8n --version` (or read the OCI version label) and write that exact tag into `.env.example`.
    For local acceptance create a local `.env` (gitignored) from `.env.example` with `POSTGRES_PASSWORD=hotel`, random
    `N8N_ENCRYPTION_KEY` / `N8N_WEBHOOK_SECRET`, `N8N_HOST=localhost`, `N8N_MOCK=1`. All documented compose commands use
    `docker compose --env-file .env -f infra/docker-compose.yml [-f infra/compose.override.yml]` from the repo root.
    Create `infra/scripts/.gitkeep` (scripts come in later cards). Write `infra/cloudflared/README.md`: how to create the tunnel, the two
    public hostnames (`hotel.<domain>` → `http://web:80`, `n8n.<domain>` → `http://n8n:5678`), the `--profile tunnel` command, and the
    ngrok alternative (§7).

### S0-05 · Sample hotel PDF + question set
- model: haiku 5.5
- depends_on: [S0-01]
- human: false
- owns:
    - docs/sample/**
- may_read: [docs/ARCHITECTURE.md, package.json]
- acceptance:
    - pnpm sample:pdf
    - node -e "const s=require('fs').statSync('docs/sample/cincinnati-hotel.pdf').size;if(s<20000)process.exit(1)"
    - node -e "const q=require('./docs/sample/questions.json');if(q.length!==10||q.filter(x=>x.answered).length!==6)process.exit(1)"
- scope: |
    `docs/sample/generate-sample-pdf.ts` using `pdfkit` (root devDependency) that writes `docs/sample/cincinnati-hotel.pdf`, ~6 pages of
    realistic, text-based (not scanned) content with headings: Welcome; Rooms (Standard King $149, Deluxe Queen $189, Riverside Suite $329,
    occupancy, amenities per room); Dining (The Fountain Room restaurant: breakfast 6:30–10:30, dinner 17:30–22:00; Lobby Bar until
    midnight; room service); Amenities (rooftop pool 7:00–21:00, 24 h fitness center, spa by appointment, free Wi-Fi, business center);
    Booking & Pricing (check-in 3:00 PM, check-out 11:00 AM, free cancellation until 48 h before arrival, deposit policy, accepted cards);
    Location & Transport (downtown Cincinnati, airport shuttle every hour $25, valet parking $35/night, nearby attractions);
    Policies (small dogs under 25 lb allowed with $50 fee, non-smoking property, children under 12 stay free, quiet hours 22:00–7:00);
    Events (Ohio Ballroom capacity 300, 4 meeting rooms, wedding packages, AV equipment). Commit the generated PDF.
    `docs/sample/questions.json`: array of 10 `{ "question", "answered": boolean, "category" }` — 6 answerable (one per major section,
    including "What time is check-in?" → Pricing & Booking) and 4 unanswerable (must include "Is there a helipad on the roof?",
    plus e.g. casino, ski rental, the CEO's name). The 3 chat suggestion chips in S3-02 will be drawn from the answerable ones.

### S0-06 · Accounts, tunnel, secrets (human)
- model: human
- depends_on: []
- human: true
- owns: []
- acceptance:
    - user confirms "done S0-06"
- scope: |
    1. Cloudflare Zero Trust → Networks → Tunnels → create tunnel (Docker connector), copy the token → `CLOUDFLARE_TUNNEL_TOKEN`.
       Add public hostnames: `hotel.<your-domain>` → `http://web:80`, `n8n.<your-domain>` → `http://n8n:5678`.
    2. Resend → add and verify your sending domain (DNS records in Cloudflare; takes minutes) → create API key → `RESEND_API_KEY`.
       Decide `EMAIL_FROM` (e.g. `Cincinnati Hotel Assistant <concierge@<your-domain>>`).
    3. Generate secrets: `openssl rand -hex 24` twice → `N8N_ENCRYPTION_KEY`, `N8N_WEBHOOK_SECRET`.
    4. On the VPS: create `/opt/cincinnati-hotel/.env` from `.env.example` with all values filled, `N8N_HOST=n8n.<your-domain>`,
       `PUBLIC_WEB_HOST=hotel.<your-domain>`, your `OPENAI_API_KEY`, `N8N_MOCK=0`. (The repo is cloned there in S5.)
    5. Confirm `ssh <vps>` works and `docker compose version` prints v2.x on the VPS.
    Report back: the two hostnames and whether Resend domain verification succeeded.
