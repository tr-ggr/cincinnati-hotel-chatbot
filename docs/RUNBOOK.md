# Runbook

Everything needed to run, test, deploy and extend the Cincinnati Hotel chatbot. Architecture and contracts:
[`ARCHITECTURE.md`](ARCHITECTURE.md). Workflow reference: [`../apps/n8n/README.md`](../apps/n8n/README.md). Public access:
[`CLOUDFLARE-TUNNEL.md`](CLOUDFLARE-TUNNEL.md).

Contents: [Prerequisites](#prerequisites) · [Environment variables](#environment-variables) · [Local run, mock mode](#local-run-mock-mode) ·
[Local run, real mode](#local-run-real-mode) · [Development without containers](#development-without-containers) ·
[n8n first run and import](#n8n-first-run-and-import) · [Tests](#tests) ·
[Deploy to a VPS](#deploy-to-a-vps) · [Extending](#extending) · [Troubleshooting](#troubleshooting)

## Prerequisites

| Need | Why | Notes |
|---|---|---|
| Docker Engine or Docker Desktop with Compose v2 | Runs postgres, n8n, api, web (and cloudflared in production) | `docker compose version` must work |
| Git Bash on Windows (or any bash on Linux/macOS) | Runs `apps/n8n/scripts/import.sh` | On Windows use Git Bash, not PowerShell |
| `jq` | Used by the n8n import and deploy scripts | Windows: put `jq.exe` on `PATH`. Debian/Ubuntu: `apt-get install jq` |
| `envsubst` (GNU gettext) | The n8n import fills the credential template with it | Debian/Ubuntu: `apt-get install gettext-base`. Git Bash: must be on `PATH`; the script stops with a message if it is missing |
| Node.js 22 and pnpm 11 (`corepack enable`) | `pnpm dev`, builds, typecheck, Vitest and Playwright (Turborepo runs them) | Containers use `node:22-alpine`, so Node is not needed to run the stack itself |
| OpenAI API key | Real mode only: embeddings and chat | Not needed in mock mode |
| Resend API key and a verified sender domain | Real mode only: lead emails | `EMAIL_FROM` must use a domain verified in Resend |
| Cloudflare account with a domain and a tunnel | Production only | See [`docs/CLOUDFLARE-TUNNEL.md`](CLOUDFLARE-TUNNEL.md) |

Host ports used in development: **3000** (API), **5432** (Postgres), **5678** (n8n), **8080** (web), **5173** (Vite dev
server, dev mode only).

## Environment variables

Copy the template once and fill it in:

```bash
cp .env.example .env
openssl rand -hex 24   # use the output for N8N_ENCRYPTION_KEY
openssl rand -hex 24   # and another one for N8N_WEBHOOK_SECRET
```

`.env` is git-ignored and must never be committed. The table lists every variable in `.env.example` and what reads it.

| Variable | Required | Read by | Purpose |
|---|---|---|---|
| `POSTGRES_USER` | yes | compose (postgres, n8n, api `DATABASE_URL`), `n8n-import.sh` | Database superuser. The default `hotel` is fine locally |
| `POSTGRES_PASSWORD` | yes | same as above | Database password. Change it from `change-me` |
| `POSTGRES_DB` | yes | same as above | App database, `hotel`. n8n uses a second database, `n8n`, created on first start |
| `N8N_VERSION` | yes | compose (image tag) | Pinned n8n version, `2.45.5`. Never `latest` |
| `N8N_ENCRYPTION_KEY` | yes | compose (n8n) | Encrypts n8n credentials. Keep it stable: a new key makes stored credentials unreadable |
| `N8N_HOST` | production | compose (n8n URLs) | Editor host, for example `n8n.example.com`. Local dev uses `localhost` from the override |
| `N8N_WEBHOOK_SECRET` | yes, even in mock mode | compose (api), `n8n-import.sh` (credential `Hotel Webhook Secret`) | Shared secret in the `x-hotel-secret` header. The API refuses to start if it is empty |
| `N8N_MOCK` | no (default `0`) | compose (api) | `1` replaces n8n and OpenAI calls with an in-process mock. Use for a no-keys demo |
| `PUBLIC_WEB_HOST` | no | nothing in the repo reads it | Informational. The public hostname is set in the Cloudflare dashboard |
| `CLOUDFLARE_TUNNEL_TOKEN` | production | compose (cloudflared, profile `tunnel`) | Tunnel token from Zero Trust |
| `OPENAI_API_KEY` | real mode | `n8n-import.sh` into the `OpenAI account` credential | Never read by the API |
| `RESEND_API_KEY` | real mode | `n8n-import.sh` into the `Resend` credential | Never read by the API |
| `EMAIL_FROM` | real mode | `n8n-import.sh` into WF3 `Compose email` | Sender, for example `"Cincinnati Hotel Assistant <concierge@example.com>"`. Empty makes the lead flow fail |
| `LEAD_TO` | real mode | `n8n-import.sh` into WF3 `Compose email` | Comma-separated recipients. **Use your own inbox while testing**. Empty makes the lead flow fail |
| `N8N_OWNER_EMAIL`, `N8N_OWNER_PASSWORD` | no | nothing in the repo reads them | Used by hand in the local owner-setup `curl` below. The template comment says `n8n-import.sh` reads them; it does not |
| `API_HOST_PORT` | no (default `3000`) | `compose.override.yml` | Host port for the API container, dev only |
| `POSTGRES_HOST_PORT` | no (default `5432`) | `compose.override.yml` | Host port for Postgres, dev only |
| `API_PORT` | no (default `3000`) | `apps/web/vite.config.ts` | Where the Vite dev server proxies `/api`. Shell variable, not in `.env` |
| `DATABASE_URL`, `N8N_BASE_URL`, `INTERNAL_BASE_URL`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `PORT` | set by compose | `apps/api/src/config.ts` | Compose sets them for the containers. For `pnpm dev` you export them yourself (see below) |

Ports are a dev concern: the production compose file publishes nothing; only the tunnel reaches the stack.

## Local run, mock mode

Mock mode needs no OpenAI or Resend keys. The API answers ingest, chat and lead calls in-process, so n8n is not used
for answers. Use it to check the stack, the UI and the end-to-end tests.

1. Fill `.env`: `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`, `N8N_WEBHOOK_SECRET`, and set `N8N_MOCK=1`. Keep `N8N_VERSION=2.45.5`.
2. Start the stack from the repo root. Compose picks up `compose.yml`, `compose.override.yml` (dev ports) and `.env`
   by itself:

   ```bash
   docker compose up -d --build --wait     # returns once every service is healthy
   docker compose ps
   ```

3. Open <http://localhost:8080>. On Windows, if another program holds IPv4 port 8080, use <http://[::1]:8080> instead
   (see [Troubleshooting](#troubleshooting)).
4. Run the end-to-end tests (see [Tests](#tests)):

   ```bash
   pnpm install && pnpm --filter e2e browsers   # once
   pnpm e2e
   ```

   Mock ingest reports 42 chunks; the guest journey asserts the `[mock]` answer text.

To leave mock mode, set `N8N_MOCK=0` and recreate the API: `docker compose up -d api`. For a one-off mock run without
editing `.env`, a shell variable wins over `.env`: `N8N_MOCK=1 docker compose up -d api`.

## Local run, real mode

Real mode sends embeddings and chat to OpenAI, and lead emails through Resend.

1. Fill `.env` with `OPENAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, and `LEAD_TO` set to **your own inbox**. Keep `N8N_MOCK=0`.
2. Start the stack (same command as mock mode): `docker compose up -d --build --wait`.
3. Create the n8n owner account and import the workflows. See [n8n first run and import](#n8n-first-run-and-import).
4. Upload the sample PDF. Generate it with `pnpm sample:pdf` if `docs/sample/cincinnati-hotel.pdf` is missing, then open
   <http://localhost:8080/admin> and upload it. Wait for the status to read **Ready**. Or from the shell:

   ```bash
   curl -F file=@docs/sample/cincinnati-hotel.pdf http://localhost:8080/api/admin/document
   ```

5. Run the real-mode tests (this uploads the sample PDF again and sends two real lead emails to `LEAD_TO`):

   ```bash
   pnpm e2e:real
   ```

   On top of the HTTP and UI checks it runs the accuracy set (`e2e/tests/real/chat-eval.spec.ts`): it prints
   question, expected, actual, category and `best_score` for each question, and passes when at least 9 of the 10
   `answered` flags match. The lead spec posts straight to the WF3 webhook and passes when n8n returns `ok: true` and
   an `email_id`. Both lead tests skip themselves when `LEAD_TO` is empty or contains a reviewer address.

Useful links in local mode: web <http://localhost:8080>, n8n editor <http://localhost:5678>, API health
<http://localhost:8080/api/health>.

## Development without containers

Use this for hot reload on the API and the web app. Postgres and n8n still run in Docker.

1. Start the two backing services:

   ```bash
   docker compose up -d postgres n8n
   ```

   The owner account and workflow import are still needed for real mode. See [n8n first run and import](#n8n-first-run-and-import).

2. Install dependencies once: `pnpm install`.
3. Export the variables the API needs. The API does not read `.env` itself. In Git Bash:

   ```bash
   set -a; . <(tr -d '\r' < .env); set +a
   export DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:${POSTGRES_HOST_PORT:-5432}/$POSTGRES_DB"
   export N8N_BASE_URL="http://localhost:5678"
   export INTERNAL_BASE_URL="http://host.docker.internal:3000"
   export UPLOAD_DIR="./uploads"
   ```

   Percent-encode the password in `DATABASE_URL` if it contains special characters. `INTERNAL_BASE_URL` must be an
   address n8n (inside Docker) can reach for this host. `host.docker.internal` works on Docker Desktop. On Linux, use
   the host's Docker bridge address instead.

4. Start both apps: `pnpm dev`. The API listens on **3000** and the web app on **5173**. Vite proxies `/api` to the
   API. If port 3000 is busy, set `PORT=3001` for the API and `API_PORT=3001` for Vite.
5. Open <http://localhost:5173>.

## n8n first run and import

The workflows and credentials are imported into n8n with a script. The script needs an owner account, which n8n creates
once, on first use.

**Owner account, in the UI (always works):** open <http://localhost:5678> (or `https://<N8N_HOST>` in production),
and create the owner account. Use a strong password (n8n requires a capital letter and a number).

**Owner account, local shortcut (dev only):** the same owner can be created by a request to n8n's setup endpoint. This
endpoint is internal to n8n and can change between versions, so use the UI if it fails:

```bash
set -a; . <(tr -d '\r' < .env); set +a
curl -s -X POST http://localhost:5678/rest/owner/setup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$N8N_OWNER_EMAIL\",\"firstName\":\"Local\",\"lastName\":\"Owner\",\"password\":\"$N8N_OWNER_PASSWORD\"}"
```

`N8N_OWNER_EMAIL` and `N8N_OWNER_PASSWORD` are not read by any script. They are only used here, so set them in your
shell or `.env` for this one call. A second call fails because the owner already exists.

**Import:**

```bash
pnpm n8n:import            # dev: uses compose.yml and the override
bash apps/n8n/scripts/import.sh --prod     # VPS: compose.yml only
```

The script loads `.env`, imports the four credentials, imports the three workflows, publishes each one, restarts n8n
and checks that the three are active. It is safe to re-run; ids are fixed. The filled credentials are streamed into the
container and never written to the host. For what each step does and the activation rule for n8n 2.x, see the
"Import" section of [`../apps/n8n/README.md`](../apps/n8n/README.md).

Verify activation by hand:

```bash
docker compose exec -T n8n n8n list:workflow --active=true --onlyId
```

The three ids `hotelIngestPdf01`, `hotelChatAnswr02` and `hotelLeadEmail03` should be listed.

## Tests

Turborepo runs every package's scripts from the root. Two layers:

**Unit and contract tests (Vitest, no stack needed)**: `pnpm test`

| Package | What it checks |
|---|---|
| `apps/api/test/` | Config validation, the n8n client (mock and HTTP, error mapping), routes through `buildApp` + `app.inject()` with the DB mocked (error envelope, `NO_DOCUMENT`, contact-form flag, leads, `/internal` secret), and the category list against `apps/web` and the `migrations/01-schema.sql` CHECK constraint |
| `apps/web/src/lib/*.test.ts` | `api.ts` (URLs, bodies, error envelope → `ApiError`), `format.ts` |
| `apps/n8n/test/` | Workflow JSON: fixed ids, secret-protected `hotel/*` webhooks, no inline keys, Structured Output Parser enum and Guard constants match the API, `prompts/chat-system.md` matches the prompt embedded in WF2, credential template placeholders |

Run one package with `pnpm --filter api test` (or `web`, `n8n`).

**End-to-end tests (Playwright, `e2e`, needs the running stack)**

| Project | Specs | Runs in |
|---|---|---|
| `api` | `tests/api/smoke.spec.ts`: health, upload the sample PDF, answerable + unanswerable chat, error envelope, lead, stats, SSE | `pnpm e2e` and `pnpm e2e:real` |
| `ui` | `tests/ui/user-journey.spec.ts` (mock only), `tests/ui/admin-realtime.spec.ts` | both |
| `real` | `tests/real/chat-eval.spec.ts` (accuracy set straight to the WF2 webhook), `tests/real/lead.spec.ts` (WF3 + Resend) | `pnpm e2e:real` only; skipped when the API is in mock mode |

`ui` and `real` depend on `api`, so the sample PDF is always uploaded first. The suite detects mock mode from
`/api/health` (`n8n: "mock"`) and relaxes content checks there. It reads `N8N_WEBHOOK_SECRET` and `LEAD_TO` from the
root `.env`.

```bash
pnpm --filter e2e browsers                                   # once per machine
pnpm e2e                                                     # mock or real stack, no direct n8n calls
pnpm e2e:real                                                # adds accuracy + lead webhook (real stack)
E2E_BASE_URL=https://hotel.example.com pnpm e2e              # against a deployed stack
pnpm --filter e2e report                                     # open the HTML report of the last run
```

| Variable | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:8080` | Web app (nginx) to test. On Windows, if `localhost` reaches another program, use `http://[::1]:8080` |
| `E2E_N8N_URL` | `http://localhost:5678` | n8n for the `real` project (published by `compose.override.yml`) |

In real mode the smoke spec's lead step sends one email to `LEAD_TO`, and `lead.spec.ts` sends a second one.

## Deploy to a VPS

The deploy target is a Linux VPS with Docker, behind a Cloudflare Tunnel. No inbound ports are opened and no TLS is
configured on the VPS: the tunnel terminates HTTPS.

Before you start, create the tunnel and its two public hostnames in the Cloudflare Zero Trust dashboard
(`hotel.<domain>` → `http://web:80`, `n8n.<domain>` → `http://n8n:5678`). Details are in
[`docs/CLOUDFLARE-TUNNEL.md`](CLOUDFLARE-TUNNEL.md).

1. **Install prerequisites on the VPS**: Docker with the Compose plugin, `git`, `jq` and `gettext-base`
   (`apt-get install -y jq gettext-base`).
2. **Clone the repository** and enter it: `git clone <repo-url> && cd <repo>`.
3. **Create `.env`** from `.env.example` on the VPS. Fill in `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`,
   `N8N_WEBHOOK_SECRET`, `N8N_HOST=n8n.<domain>`, `PUBLIC_WEB_HOST=hotel.<domain>`, `CLOUDFLARE_TUNNEL_TOKEN`,
   `OPENAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `N8N_MOCK=0`. Set `LEAD_TO` to **your own inbox** until the final
   reviewer test. Do not put the reviewers' addresses in `LEAD_TO` before that test. Also add
   `COMPOSE_FILE=compose.yml`: the checkout contains the dev-only `compose.override.yml`, which plain `docker compose`
   would otherwise merge in (published ports, plain-HTTP n8n). With it set, every `docker compose ...` on the VPS uses
   the production file only.
4. **Deploy**: `docker compose -f compose.yml --profile tunnel up -d --build --wait`. This builds and starts the stack
   with the tunnel and returns once every service is healthy (no override file). Check with
   `docker compose -f compose.yml ps`.
5. **Create the n8n owner account in the UI** at `https://n8n.<domain>`. The local shortcut is for dev only.
6. **Import the workflows**: `bash apps/n8n/scripts/import.sh --prod`.
7. **Upload the PDF** at `https://hotel.<domain>/admin` and wait for **Ready**.
8. **Public end-to-end test** (from your machine): `E2E_BASE_URL=https://hotel.<domain> pnpm e2e`. In real mode this
   sends one lead email to `LEAD_TO`. The `real` project needs n8n on `E2E_N8N_URL` with the webhook secret, so run
   it locally rather than against production.

Afterwards, failed executions are visible at `https://n8n.<domain>` (successful runs are not stored, see
[Memory budget](#memory-budget)), and the dashboard is at `https://hotel.<domain>/admin`.

Updating: `git pull --ff-only`, re-run the step 4 command, and re-run `bash apps/n8n/scripts/import.sh --prod` if any
workflow or credential changed. The `n8n_data` and `pgdata` volumes survive rebuilds.

### Memory budget

`compose.yml` caps the whole stack below 1 GB so it fits a 4 GB VPS with room to spare.

| Service | `mem_limit` | Tuning |
|---|---|---|
| postgres | 144m | `shared_buffers=48MB`, `max_connections=30`, `work_mem=4MB`, `maintenance_work_mem=32MB` |
| n8n | 640m | main heap 320 MB, Code-node task runner heap 96 MB, runner concurrency 2 |
| api | 128m | heap 96 MB, pg pool `max: 5` |
| web | 16m | nginx `worker_processes 1` |
| cloudflared | 48m | |

Total cap is 976m. Measured after a full `pnpm e2e` run (real mode): n8n ~490 MiB (main process plus an always-on
JS task runner of ~130 MiB), api ~75, postgres ~45, nginx ~3, about 610 MiB without cloudflared. The peak is a PDF
upload, which n8n parses in-process.

- Check usage: `docker stats --no-stream`.
- Check for OOM kills: `docker inspect --format '{{.Name}} {{.State.OOMKilled}}' $(docker compose -f compose.yml ps -q)`.
  If n8n gets killed during an ingest, raise its `mem_limit` (and `NODE_OPTIONS` heap) and take the difference from
  postgres, which rarely goes past ~60 MiB here.
- n8n stores only failed executions (`EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`), pruned after 72 h. To debug a
  successful run, open the workflow in the editor and run it manually; the output shows live but is not saved.
- Recommended safety net on the VPS: a 1–2 GB swapfile
  (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`, plus an `/etc/fstab` entry).

## Extending

### Add a new category

A category is a fixed string that appears in four places, plus the prompt and the guard code. All of them must match
exactly, including `&` and spacing.

1. `apps/api/src/lib/categories.ts`: add the value to `CATEGORIES`.
2. `apps/web/src/lib/categories.ts`: the same change, so the admin chart shows it.
3. `migrations/01-schema.sql`: add the value to the `CHECK` on `messages.category`. This only applies to a new database.
   An existing database needs a migration, run once with `psql` against the `hotel` database:

   ```sql
   ALTER TABLE messages DROP CONSTRAINT messages_category_check;
   ALTER TABLE messages ADD CONSTRAINT messages_category_check CHECK (category IN (
     'Rooms','Restaurant & Dining','Amenities & Facilities','Pricing & Booking',
     'Location & Transport','Policies','Events','Other','<New category>'));
   ```

4. `apps/n8n/workflows/02-chat-answer.json`: add the value to the `enum` of the **Structured Output Parser** schema. Also add
   it to the `CATEGORIES` array in the **Guard & finalize** code node, or the guard will rewrite it to `Other`.
5. `apps/n8n/prompts/chat-system.md`: add it to rule 5's list, then paste the same text into the **Basic LLM Chain** node
   and run the prompt sync check in [`../apps/n8n/README.md`](../apps/n8n/README.md#overview). The `CATEGORIES` list in the Guard
   code is the list step 4 describes.

Then re-import with `pnpm n8n:import` and rerun `pnpm e2e:real`.

### Swap the LLM

- **Same provider, different model.** Change the `model` value of the `OpenAI Chat Model` nodes in WF2 and WF3, and
  rerun `pnpm e2e:real` afterwards, since category and `answered` behaviour depend on the model. For embeddings, change
  the model in both `Embeddings OpenAI` nodes, but the output must stay **1536 dimensions** to match `vector(1536)`.
  A new embedding model needs a **full re-ingest** of the PDF, because old vectors are not comparable to new ones.
  Details in [`../apps/n8n/README.md`](../apps/n8n/README.md#changing-the-openai-model).
- **Another provider.** The API has no provider code, so only n8n changes: replace the chat and embedding nodes in
  WF1, WF2 and WF3 with the provider's n8n nodes, add a credential to `apps/n8n/credentials.template.json` and a variable to
  `.env.example`, and update the `OPENAI_API_KEY` check in `n8n-import.sh`, which is hard-coded for OpenAI and only
  warns when it is empty. Keep the output contract of WF2 (`answer`, `category`, `answered`, `sources`) so the API does
  not change. Embedding dimensions must still match the schema, or the schema must change too.

### Swap the email provider

The lead email is one code node plus one HTTP node. The steps are in
[`../apps/n8n/README.md`](../apps/n8n/README.md#changing-the-email-provider): change `Compose email` (payload shape), `Send via
Resend` (URL, auth), the credential template and the environment variable. Keep the response `id` so WF3 can return
`email_id`. Then run `pnpm e2e:real` with your own inbox in `LEAD_TO`.

### Re-export workflows after editing in the UI

The files in `apps/n8n/workflows/` are the source of truth. Edit in the n8n editor, then export and copy them back:

```bash
docker compose exec -T n8n n8n export:workflow --all --separate --output=/tmp/wf
docker compose cp n8n:/tmp/wf/. apps/n8n/workflows/
```

Then rename the exported files to `01-ingest-pdf.json`, `02-chat-answer.json` and `03-lead-email.json`, and check the
diff before committing:

- `03-lead-email.json` will contain the real `EMAIL_FROM` and `LEAD_TO` values in `Compose email`. Put back the
  placeholders `${EMAIL_FROM}` and `${LEAD_TO}`, so no real address enters git.
- Every file must keep its top-level `"id"`. The `active` flag is not a reason for a change, because activation is done
  by the import script.

## Troubleshooting

### Setup and ports

| Symptom | Cause | Fix |
|---|---|---|
| `Bind for 0.0.0.0:3000 failed` or `port is already allocated` | Something else uses the API port | Set `API_HOST_PORT` in `.env` (for example `3001`) and recreate the api container |
| Same for `5432` | A local Postgres is running | Set `POSTGRES_HOST_PORT` (for example `5433`). Dev-mode `DATABASE_URL` must use the same port |
| `http://localhost:8080` shows the wrong site | On Windows, another program may listen on IPv4 `:8080`, while the stack listens on `[::1]:8080` | Use `http://[::1]:8080` in the browser, and `E2E_BASE_URL='http://[::1]:8080'` for Playwright. The web port is set in `compose.override.yml`; change it there if you need a different port |
| Compose variables are empty (`POSTGRES_USER` warnings, containers fail) | Compose was run outside the repo root, so it did not find `.env` | Run `docker compose` from the repo root (or pass `--env-file /path/to/.env`) |
| api container exits at start with `Invalid API configuration` | A required variable is empty, most often `N8N_WEBHOOK_SECRET` | The log lists the variables. Fill them in `.env` and recreate the api container |
| A container is `unhealthy` | Healthcheck failing | `docker compose ... logs <service>`. Healthchecks use `127.0.0.1`, so a `localhost` problem is not the cause |
| `pnpm dev` API cannot reach the database | The API does not read `.env`, or `DATABASE_URL` is wrong | Export the variables as shown in [Development without containers](#development-without-containers) |

### n8n and workflows

| Symptom | Cause | Fix |
|---|---|---|
| Chat or upload returns `502` and the webhook returns 404 in the n8n log | The workflow is not published | Run `pnpm n8n:import` (see [`../apps/n8n/README.md`](../apps/n8n/README.md#troubleshooting)) |
| Webhook returns 403 | `x-hotel-secret` does not match the stored `Hotel Webhook Secret` | `N8N_WEBHOOK_SECRET` must match between the API and the import. Fix `.env` and re-run the import |
| Import warns `OPENAI_API_KEY is EMPTY` | `.env` has no key | Fill it and re-run the import. The credential is imported empty until then |
| Import stops with `… is empty in .env` | A required variable is missing | Fill it in `.env` and re-run (CRLF line endings are tolerated) |
| Import stops with `envsubst: command not found` | gettext is not installed | Install `gettext-base` (Linux) or make `envsubst` available to Git Bash |
| Owner setup `curl` fails or returns an error body | An owner already exists, or the internal endpoint changed in this n8n version | Use the existing owner, or create the owner in the UI, then run the import |

### Answers, upload and leads

| Symptom | Cause | Fix |
|---|---|---|
| Chat returns `502 ASSISTANT_UNAVAILABLE` | OpenAI key missing or wrong, quota, rate limit, network or timeout. The guard rethrows these as errors | Check the `OpenAI account` credential and the failing execution in n8n. Retry in the UI |
| Chat answers "I'm sorry, I don't have that information" for everything | No chunks for the active document (`n_chunks = 0`), or the PDF was never ingested | Check the document status in `/admin`. Re-upload the PDF |
| Chat returns `409 NO_DOCUMENT` | No document has reached **Ready** | Upload the PDF and wait for Ready |
| Upload returns `422 EMPTY_PDF` | Fewer than 200 characters of extractable text, usually a scanned PDF | Use a PDF with a text layer. OCR is not supported |
| Upload returns `422 INVALID_PDF` | Not a PDF, or unreadable | Check the file |
| Upload returns `413 FILE_TOO_LARGE` | Over 25 MB (`MAX_UPLOAD_MB`). nginx accepts up to 50 MB, so the API check is what rejects it | Compress or split the PDF |
| Upload returns `502 INGEST_FAILED` | WF1 failed: download, parsing or embeddings | Open the failing execution in the n8n Executions list. The previous document stays active |
| Lead shows `emailStatus: failed` | Resend key wrong, sender domain not verified, or `EMAIL_FROM` / `LEAD_TO` empty (the `Compose email` node throws) | Check the three variables, re-run the import, then `lead.spec.ts` |
| The lead tests are skipped | `LEAD_TO` is empty or contains a reviewer address | Set `LEAD_TO` to your own inbox, re-run the import, then retry |

### Dashboard

| Symptom | Cause | Fix |
|---|---|---|
| Badge stays on **Connecting** or goes to **Polling** | The SSE stream is buffered or dropped, or the API is down | Check `curl -N --max-time 4 http://localhost:8080/api/admin/stats/stream` shows `event: stats`. Behind the tunnel, check the Cloudflare hostname points at `web:80`. The page falls back to polling by design |
| A failed question does not appear until the next change | The 502 path does not emit a stats event | Known gap, see [`ADMIN-DASHBOARD.md`](ADMIN-DASHBOARD.md#data-flow-message-to-chart) |

If something is not listed, the first place to look is `docker compose logs --tail=100 <service>`,
followed by the n8n Executions list at `https://<N8N_HOST>` or `http://localhost:5678`.
