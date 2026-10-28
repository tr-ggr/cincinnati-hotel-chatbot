# Sprints — orchestration protocol

This folder drives the build. It is written for a Claude Code orchestrator session (`/goal`, running on
**Claude Opus 5.5**) that spawns one subagent per task card. Humans can also follow it by hand.

Deadline: **Thu 2026-10-29 15:00 PHT**. Target: submit by 12:00 PHT.

## Files

| File | Purpose |
|---|---|
| `README.md` | this protocol |
| `STATUS.md` | card state table — **the only file the orchestrator itself edits** |
| `S0-scaffold-infra.md` … `S5-deploy-submit.md` | one file per sprint: goal, gate, cards |
| `../docs/ARCHITECTURE.md` | the contract every card references by section (§) |
| `../.claude/CLAUDE.md` | conventions injected into every subagent prompt |

## Card format

Each card is a `### S<n>-<k> · <title>` heading followed by a YAML-ish block:

```markdown
### S1-02 · Sessions & leads routes
- model: sonnet 5.5
- depends_on: [S1-01]
- human: false
- owns:
    - apps/api/src/routes/sessions.ts
    - apps/api/src/routes/leads.ts
- may_read: [apps/api/src/**, infra/db/01-schema.sql, docs/ARCHITECTURE.md]
- acceptance:
    - pnpm --filter api typecheck
    - bash infra/scripts/smoke.sh --mock --base http://localhost:8080 --only chat,lead
- scope: |
    What to build, with §references into docs/ARCHITECTURE.md.
```

| Field | Meaning |
|---|---|
| `model` | which Claude model runs the subagent — see **Model policy** |
| `depends_on` | card ids (or `S<n> gate`) that must be `passed` first |
| `human` | `true` → instructions for the user, not an agent |
| `owns` | globs the subagent may edit. **Cards that can run concurrently must have disjoint `owns`.** |
| `may_read` | globs the subagent should read for context (it may read anything; this is guidance) |
| `acceptance` | commands run from repo root after the subagent returns; all must exit 0 |
| `scope` | the task. Pasted verbatim into the subagent prompt |

## Model policy

| Tag in card | Model id | Use for |
|---|---|---|
| `opus 5.5` | `claude-opus-5-5` | architecture-sensitive work, n8n workflow authoring, cross-stack debugging, `*-FIX` cards |
| `sonnet 5.5` | `claude-sonnet-5-5` | well-specified feature implementation: routes, pages, compose, clients, scripts with logic |
| `haiku 5.5` | `claude-haiku-5-5` | scaffolds, boilerplate, config, docs, test scripts, handoff follow-ups |

Escalation: a card that fails acceptance twice is re-dispatched one tier up (haiku → sonnet → opus). Never downgrade.
The orchestrator itself runs on Opus 5.5 and does **not** implement cards; it dispatches, verifies, records and commits.

## Orchestrator loop

1. Read `README.md`, `../.claude/CLAUDE.md`, `STATUS.md`. Pick the lowest-numbered sprint that has unfinished cards.
2. Build the dependency DAG from `depends_on`. A card is **ready** when every dependency is `passed` (a `S<n> gate` dependency means that sprint's gate passed).
3. Launch **all ready non-human cards concurrently**, one subagent each, using the card's `model`. The subagent prompt is:
   - the contents of `.claude/CLAUDE.md`
   - the card block verbatim
   - "Only modify files matching `owns`. If something outside `owns` must change, do not change it — describe it under a `HANDOFF:` heading in your final report. Run the `acceptance` commands yourself before reporting and paste their output."
4. Human cards (`human: true`): print the instructions to the user, set state `blocked-human`, continue with other ready cards. Re-check when the user says e.g. "done S0-06".
5. When a subagent returns, run its `acceptance` commands verbatim from the repo root.
   - all exit 0 → `passed`
   - otherwise → `failed(n)`; re-dispatch the same card with the failure output appended. Max 2 retries; escalate the model on the 2nd. A 3rd failure → stop and ask the user.
6. Any `HANDOFF:` content → create an ad-hoc card `S<n>-H<k>` (haiku 5.5) owning exactly the files named, append it to `STATUS.md`, and schedule it like any other card.
7. When every card in the sprint is `passed` (or `skipped` with a recorded reason for cards marked droppable), run the sprint **gate** commands.
   - gate passes → `git add -A && git commit -m "S<n>: <sprint title>"` (plain message, **no co-author trailer**) → advance to the next sprint.
   - gate fails → create `S<n>-FIX` (opus 5.5) owning everything, run it alone, re-run the gate.
8. S2 (n8n) and S3 (frontend) both depend only on the S1 gate. Run them concurrently if the orchestrator can hold two sprint contexts; otherwise run S2 first (it carries the most risk).

## Rules

- Never run two cards whose `owns` overlap at the same time.
- Never write secrets into tracked files. `.env` is gitignored; cards that need keys read them from `.env`.
- All subagents work in the same working tree (disjoint `owns` makes this safe). No worktrees.
- Commits happen only at sprint gates. Subagents never commit.
- Record every state change in `STATUS.md` immediately (state, attempt count, one-line note).
- If a card's scope conflicts with `docs/ARCHITECTURE.md`, ARCHITECTURE wins; note the discrepancy in STATUS.md.
- Time-box: if a sprint exceeds its budget by 50 %, drop cards marked **droppable** and move on.

## States

`todo` · `running` · `passed` · `failed(n)` · `blocked-human` · `skipped(reason)`

## Suggested timeline (PHT, Oct 28–29)

S0 by 20:30 · S1 by 22:30 · S2 ∥ S3 by 02:00 · S4 by 04:00 · buffer / sleep · S5 09:00–11:30 · submit by 12:00.
