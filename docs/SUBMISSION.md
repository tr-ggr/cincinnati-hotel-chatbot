# Submission — Cincinnati Hotel chatbot

Fill the three `⟨…⟩` values once the VPS deploy (S5-02) and the GitHub repo (S5-01) exist, tick the checklist, then send the
email draft at the bottom.

| | |
|---|---|
| Live app | `https://⟨PUBLIC_WEB_HOST⟩` (landing `/` → Regular User `/chat`, Admin `/admin`) |
| n8n editor | `https://⟨N8N_HOST⟩` |
| Repository | https://github.com/tr-ggr/cincinnati-hotel-chatbot (private — make public or invite reviewers before sending) |
| Workflows (JSON) | [`apps/n8n/workflows/`](../apps/n8n/workflows/) — `01-ingest-pdf.json`, `02-chat-answer.json`, `03-lead-email.json` |
| Docs | [ARCHITECTURE](ARCHITECTURE.md) · [PDF-PROCESSING](PDF-PROCESSING.md) · [ADMIN-DASHBOARD](ADMIN-DASHBOARD.md) · [RUNBOOK](RUNBOOK.md) |

## Verified locally in real mode (2026-10-29)

Real OpenAI (`gpt-4.1-mini`, `text-embedding-3-small`) and Resend, full Docker Compose stack:

- Sample PDF → 7 pages, 24 chunks. Replacing it with a second PDF purges the old chunks and file; answers switch to the new document.
- Accuracy set (`apps/e2e/tests/real/chat-eval.spec.ts`, formerly `chat-eval.sh`) 10/10 (6 answerable, 4 unanswerable → exact fallback sentence), greeting answered as small talk.
- Edge cases grounded: follow-up ("How much is that?"), multi-part question, Spanish question (answered in Spanish), cross-chunk
  arithmetic (price difference between two rooms).
- HTTP smoke (`apps/e2e/tests/api/smoke.spec.ts`, formerly `smoke.sh`) 3× in a row PASS (upload, chat, unanswered → contact form, lead email sent, stats, SSE).
- `pnpm typecheck && pnpm build && pnpm test` green; no unhandled/FATAL lines and no secrets in the API logs.

## n8n reviewer access

**Option A — invite reviewers as n8n users.** n8n needs SMTP to send invites. Add to the `n8n` service environment in
`compose.yml` (optional; not enabled by default):

```yaml
      N8N_EMAIL_MODE: smtp
      N8N_SMTP_HOST: smtp.resend.com
      N8N_SMTP_PORT: 465
      N8N_SMTP_USER: resend
      N8N_SMTP_PASS: ${RESEND_API_KEY}
      N8N_SMTP_SENDER: ${EMAIL_FROM}
      N8N_SMTP_SSL: "true"
```

Then `docker compose up -d n8n`, open n8n → Settings → Users → Invite, and invite
`idan@tauga.ai` and `deleonajiraydiego@gmail.com` (role Member; share the three workflows with them).

**Option B — screenshots + exported JSON.** Capture each workflow canvas and one successful execution into `docs/screenshots/`
(`wf1-ingest.png`, `wf1-execution.png`, `wf2-chat.png`, `wf2-execution.png`, `wf3-lead.png`, `wf3-execution.png`) and attach them to
the email. The exported workflow JSON in `apps/n8n/workflows/` is identical to what is deployed (credentials are referenced by id only;
`EMAIL_FROM` / `LEAD_TO` stay as `${…}` placeholders filled at import time).

## Before the final reviewer test

- On the VPS set `LEAD_TO=idan@tauga.ai,deleonajiraydiego@gmail.com` in `.env`, then re-run `pnpm n8n:import`.
- Send exactly **one** real lead from the public site (ask an unanswerable question, e.g. "Is there a helipad on the roof?", then
  submit the contact form). Every real-mode e2e run also sends an email, so do not run `pnpm e2e` against prod after this change.

## Checklist

- [ ] Landing loads at the public URL; Admin and Regular User work on mobile and desktop
- [ ] Sample PDF uploaded, status ready; replacing with a second PDF works and answers change
- [ ] Answerable question answered from the PDF; unanswerable → exact sorry sentence + contact form
- [ ] Lead email delivered to both reviewer addresses (one real test) with summary + unanswered question
- [ ] Admin stats change within 1 s of a chat message in another tab ("Live" badge green)
- [ ] n8n: 3 workflows active; screenshots captured; invite sent or JSON exported in `apps/n8n/workflows/`
- [ ] GitHub repo pushed; reviewers invited or public link; `.env` not committed
- [ ] Docs: ARCHITECTURE, PDF-PROCESSING, ADMIN-DASHBOARD, RUNBOOK, SUBMISSION
- [ ] Submission email sent before 14:00 PHT

## Email draft

**To:** idan@tauga.ai, deleonajiraydiego@gmail.com
**Subject:** Entrance task submission — Cincinnati Hotel chatbot — ⟨YOUR NAME⟩

> Hi Idan, hi Diego,
>
> Here is my submission for the Cincinnati Hotel chatbot entrance task.
>
> - **Live app:** https://⟨PUBLIC_WEB_HOST⟩ — pick "Regular User" to chat or "Admin" to upload the PDF and watch the live stats.
> - **Repository:** https://github.com/tr-ggr/cincinnati-hotel-chatbot (you have been invited / the repo is public).
> - **n8n:** https://⟨N8N_HOST⟩ — you should have an invite from n8n; otherwise the workflow screenshots are attached and the exported
>   JSON is in `apps/n8n/workflows/`.
>
> **Architecture in three lines**
> 1. React + Vite SPA behind nginx, Fastify API, Postgres + pgvector, n8n — one Docker Compose stack on a VPS behind a Cloudflare Tunnel.
> 2. All AI logic lives in three n8n workflows: PDF ingest (chunk + embed into pgvector), grounded chat answer (retrieve → LLM with a
>    structured category/answered output → deterministic guard), and lead email (LLM summary → Resend).
> 3. The admin dashboard is fed by Server-Sent Events, so totals and the per-category chart update within a second of each message.
>
> **Heads-up:** you received one sample lead email from the chatbot — that was my end-to-end test of the contact form.
>
> **Test it in 60 seconds**
> 1. Open the live app → Admin. The sample hotel PDF is already uploaded (status "ready"); keep this tab open.
> 2. In a second tab → Regular User → ask "What time is check-in?" (answered from the PDF) and watch the admin counters move.
> 3. Ask "Is there a helipad on the roof?" → you get "I'm sorry, I don't have that information right now." and a contact form.
> 4. Submit the form → an email with a summary and the unanswered question arrives at both of your addresses.
>
> Docs: `docs/ARCHITECTURE.md`, `docs/PDF-PROCESSING.md`, `docs/ADMIN-DASHBOARD.md`, `docs/RUNBOOK.md`.
>
> Best regards,
> ⟨YOUR NAME⟩
