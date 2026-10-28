# S5 — Deploy, smoke, submit

- Budget: ≤ 1.5 h · Window: 09:00–11:30 PHT · **Submission email must go out before 14:00 PHT (deadline 15:00)**
- Goal: the system is live on the public URL, reviewers have access to the repo and the n8n workflows, and the submission email is sent.
- Gate: every checklist item in `docs/SUBMISSION.md` ticked; `STATUS.md` all `passed`/`skipped`.
- Commit on pass: `S5: deploy`

Parallelism: S5-01 (human) and S5-03 can start right after the S4 gate. S5-02 needs S0-06 + S5-01. S5-04 last.

---

### S5-01 · GitHub repo (human)
- model: human
- depends_on: [S4 gate]
- human: true
- owns: []
- acceptance:
    - user confirms "done S5-01" with the repo URL
- scope: |
    Create a private GitHub repo (e.g. `cincinnati-hotel-chatbot`), `git remote add origin ...`, `git push -u origin main`.
    Reviewer GitHub handles are not given in the brief: either (a) ask for them in the submission email and invite on reply, or
    (b) make the repo public and send the link. Record the choice and the URL in `sprints/STATUS.md`.

### S5-02 · Deploy script, VPS deploy, public smoke
- model: opus 5.5
- depends_on: [S0-06, S5-01]
- human: false
- owns:
    - infra/scripts/deploy.sh
- may_read: [**]
- acceptance:
    - bash -n infra/scripts/deploy.sh
    - bash -c 'source .env; bash infra/scripts/smoke.sh --base https://$PUBLIC_WEB_HOST'
    - bash -c 'source .env; curl -fsS -o /dev/null -w "%{http_code}\n" https://$N8N_HOST/healthz | grep -q 200'
- scope: |
    Write `infra/scripts/deploy.sh` (idempotent, run on the VPS from the repo root): `git pull --ff-only`,
    `docker compose --env-file .env -f infra/docker-compose.yml --profile tunnel up -d --build`, wait for postgres/n8n/api healthy
    (loop on `docker compose ps --format json`), print the public URLs. Then drive the deployment **with the user** (they run commands
    on the VPS, or you run them via `ssh` if key auth is configured — ask first):
    1. `git clone <repo> /opt/cincinnati-hotel && cd /opt/cincinnati-hotel` (`.env` already placed there in S0-06) → `bash infra/scripts/deploy.sh`.
    2. Open `https://<N8N_HOST>`, create the owner account (user does this), then `bash infra/scripts/n8n-import.sh` on the VPS; confirm the
       3 workflows are Active.
    3. Upload `docs/sample/cincinnati-hotel.pdf` through the public admin page; run the public smoke test (acceptance).
    4. Keep `LEAD_TO` = the user's own inbox during all of the above. As the **final** step, set `LEAD_TO` to the reviewer addresses,
       re-run `n8n-import.sh`, and submit exactly one real contact form so the reviewers receive one sample lead email (mention this in
       the submission email).
    5. Confirm SSE through the tunnel: open /admin in a browser, send a chat message in another tab, counts update without reload.
    Paste the smoke output and the final URLs in the report.

### S5-03 · Submission document
- model: haiku 5.5
- depends_on: [S4 gate]
- human: false
- owns:
    - docs/SUBMISSION.md
- may_read: [**]
- acceptance:
    - bash -c 'test -s docs/SUBMISSION.md && ! grep -q "TODO\|<placeholder>" docs/SUBMISSION.md'
- scope: |
    Write `docs/SUBMISSION.md` with: live URL (`https://<PUBLIC_WEB_HOST>`), repo URL (from STATUS.md; use `https://github.com/<owner>/<repo>`
    and ask the orchestrator if unknown), n8n reviewer access — option A: invite via n8n Settings → Users (requires SMTP: env
    `N8N_EMAIL_MODE=smtp`, `N8N_SMTP_HOST=smtp.resend.com`, `N8N_SMTP_PORT=465`, `N8N_SMTP_USER=resend`, `N8N_SMTP_PASS=<RESEND_API_KEY>`,
    `N8N_SMTP_SENDER=<EMAIL_FROM>`, `N8N_SMTP_SSL=true` — document as an optional addition to compose), option B: screenshots in
    `docs/screenshots/` + exported JSON in `n8n/workflows/`; the final checklist below; and a ready-to-send email draft addressed to
    idan@tauga.ai and deleonajiraydiego@gmail.com (subject "Entrance task submission — Cincinnati Hotel chatbot — <name>", body: live URL,
    repo link/invite note, n8n access or screenshots attached, 3-line architecture summary, note about the one sample lead email they received,
    how to test in 60 seconds).
    Checklist:
    - [ ] Landing loads at the public URL; Admin and Regular User work on mobile and desktop
    - [ ] Sample PDF uploaded, status ready; replacing with a second PDF works and answers change
    - [ ] Answerable question answered from the PDF; unanswerable → exact sorry sentence + contact form
    - [ ] Lead email delivered to both reviewer addresses (one real test) with summary + unanswered question
    - [ ] Admin stats change within 1 s of a chat message in another tab ("Live" badge green)
    - [ ] n8n: 3 workflows active; screenshots captured; invite sent or JSON exported in `n8n/workflows/`
    - [ ] GitHub repo pushed; reviewers invited or public link; `.env` not committed
    - [ ] Docs: ARCHITECTURE, PDF-PROCESSING, ADMIN-DASHBOARD, RUNBOOK, SUBMISSION
    - [ ] Submission email sent before 14:00 PHT

### S5-04 · Screenshots and submission email (human)
- model: human
- depends_on: [S5-02, S5-03]
- human: true
- owns: []
- acceptance:
    - user confirms "done S5-04"
- scope: |
    1. In the public n8n editor, take screenshots of each of the 3 workflows (canvas) and of one successful execution each → save to
       `docs/screenshots/` (`wf1-ingest.png`, `wf1-execution.png`, …). Optionally a screenshot of the admin dashboard and chat.
    2. `git add -A && git commit -m "S5: deploy" && git push`.
    3. Send the email drafted in `docs/SUBMISSION.md` to idan@tauga.ai and deleonajiraydiego@gmail.com with the screenshots attached
       (or the n8n invite). Tick the checklist. Tell the orchestrator "done S5-04" so it can close `STATUS.md`.
