# Cincinnati Hotel Chatbot

Entrance task for Tauga AI (Developer – Automation & AI Agent). A hotel information chatbot that answers guests
**only** from an admin-uploaded PDF, offers a contact form when it can't answer (emailing a conversation summary
to the hotel team), and gives admins a real-time usage dashboard.

- **Stack**: React + Vite (web) · Node.js / Fastify (API) · **n8n** (all AI orchestration) · Postgres + pgvector · OpenAI · Resend · Docker Compose · Cloudflare Tunnel
- **Task brief**: `docs/Cincinnati-Hotel-Chatbot-Entrance-Task.pdf`
- **Architecture & contracts**: `docs/ARCHITECTURE.md` (source of truth for schema, API, n8n workflows, compose)
- **Build plan**: `sprints/` — model-tagged task cards consumed by a Claude Code orchestrator (`sprints/README.md`)
- **Agent conventions**: `.claude/CLAUDE.md`

Docs written during the build (S4/S5): `docs/PDF-PROCESSING.md`, `docs/ADMIN-DASHBOARD.md`, `docs/RUNBOOK.md`, `docs/SUBMISSION.md`.
