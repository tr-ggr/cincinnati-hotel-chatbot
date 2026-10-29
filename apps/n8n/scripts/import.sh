#!/usr/bin/env bash
# Import n8n credentials + workflows from the repo into the running n8n container and publish (activate) them.
#
# Usage (from any directory; Git Bash on Windows or Linux):
#   pnpm n8n:import                                  # dev: compose.yml + compose.override.yml (if present)
#   bash apps/n8n/scripts/import.sh --prod           # deploy: compose.yml only
#   COMPOSE_FILES="compose.yml" ENV_FILE=.env bash apps/n8n/scripts/import.sh
#
# Prerequisites: stack running (`n8n` service healthy) and the n8n owner account created once in the UI.
#
# What it does (idempotent — fixed ids, re-running overwrites in place):
#   1. loads .env, fills apps/n8n/credentials.template.json (${VAR} placeholders, values JSON-escaped) and streams it
#      straight into the container (/tmp/hotel-import) — the filled file is never written on the host
#   2. n8n import:credentials
#   3. copies apps/n8n/workflows/*.json into the container (03-* gets ${EMAIL_FROM} / ${LEAD_TO} substituted first)
#      and runs n8n import:workflow --separate
#   4. n8n publish:workflow --id=<id> for every imported workflow (n8n 2.x: update:workflow --active is deprecated)
#   5. deletes the temp files in the container, restarts n8n and waits for /healthz, then verifies activation
set -euo pipefail

# Git Bash: don't rewrite container paths like /tmp/... into C:/... when passed to docker.exe
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
N8N_DIR=apps/n8n
cd "$ROOT"

log()  { printf '\033[1;34m[n8n-import]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[n8n-import] WARNING:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[n8n-import] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

PROD=0
for arg in "$@"; do
  case "$arg" in
    --prod) PROD=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "unknown argument: $arg" ;;
  esac
done

for bin in docker jq envsubst; do
  command -v "$bin" >/dev/null 2>&1 || die "'$bin' is required but not installed"
done

ENV_FILE="${ENV_FILE:-.env}"
[ -f "$ENV_FILE" ] || die "env file '$ENV_FILE' not found (copy .env.example to .env and fill it)"

if [ -z "${COMPOSE_FILES:-}" ]; then
  COMPOSE_FILES="compose.yml"
  if [ "$PROD" = 0 ] && [ -f compose.override.yml ]; then
    COMPOSE_FILES="$COMPOSE_FILES compose.override.yml"
  fi
fi
DC=(docker compose --env-file "$ENV_FILE")
for f in $COMPOSE_FILES; do DC+=(-f "$f"); done
log "compose: ${DC[*]}"

# --- load .env (tolerate CRLF line endings) ---------------------------------------------------------------
set -a
# shellcheck disable=SC1090
source <(tr -d '\r' < "$ENV_FILE")
set +a

for v in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB N8N_WEBHOOK_SECRET; do
  [ -n "${!v:-}" ] || die "$v is empty in $ENV_FILE"
done
[ -n "${OPENAI_API_KEY:-}" ] || warn "OPENAI_API_KEY is EMPTY — credential 'OpenAI account' is imported with an empty key; embeddings/chat will fail until you fill it and re-run this script"
[ -n "${RESEND_API_KEY:-}" ] || warn "RESEND_API_KEY is EMPTY — credential 'Resend' is imported with an empty key; lead emails will fail until you fill it and re-run this script"

shopt -s nullglob
WORKFLOWS=("$N8N_DIR"/workflows/*.json)
shopt -u nullglob

# --- container checks -----------------------------------------------------------------------------------
n8n_exec() { "${DC[@]}" exec -T n8n "$@"; }
n8n_exec true 2>/dev/null || die "n8n container is not running (start the stack first)"
log "n8n version: $(n8n_exec n8n --version | tr -d '\r' | tail -1)"

CTMP=/tmp/hotel-import
cleanup() { "${DC[@]}" exec -T n8n rm -rf "$CTMP" >/dev/null 2>&1 || true; }
trap cleanup EXIT
n8n_exec sh -c "rm -rf $CTMP && mkdir -p $CTMP/workflows && chmod 700 $CTMP"

# JSON-escape a value so it can be substituted inside a JSON string literal
json_escape() { printf '%s' "$1" | jq -Rs . | sed -e 's/^"//' -e 's/"$//'; }

# --- credentials ----------------------------------------------------------------------------------------
log "importing credentials from $N8N_DIR/credentials.template.json"
(
  for v in OPENAI_API_KEY RESEND_API_KEY POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB N8N_WEBHOOK_SECRET; do
    export "$v=$(json_escape "${!v:-}")"
  done
  envsubst '${OPENAI_API_KEY} ${RESEND_API_KEY} ${POSTGRES_USER} ${POSTGRES_PASSWORD} ${POSTGRES_DB} ${N8N_WEBHOOK_SECRET}' \
    < "$N8N_DIR/credentials.template.json" | jq -c .
) | n8n_exec sh -c "umask 077 && cat > $CTMP/credentials.json"
n8n_exec n8n import:credentials --input="$CTMP/credentials.json"
n8n_exec rm -f "$CTMP/credentials.json"

# --- workflows ------------------------------------------------------------------------------------------
if [ "${#WORKFLOWS[@]}" -eq 0 ]; then
  warn "no workflow files in $N8N_DIR/workflows/ — nothing to import"
else
  IDS=()
  for wf in "${WORKFLOWS[@]}"; do
    base="$(basename "$wf")"
    id="$(jq -er '.id' "$wf")" || die "$wf has no top-level \"id\" (needed for idempotent re-imports)"
    IDS+=("$id")
    if [[ "$base" == 03-* ]]; then
      [ -n "${EMAIL_FROM:-}" ] || warn "EMAIL_FROM is EMPTY — $base will send from an empty address"
      [ -n "${LEAD_TO:-}" ]    || warn "LEAD_TO is EMPTY — $base will have no recipients"
      (
        export EMAIL_FROM="$(json_escape "${EMAIL_FROM:-}")" LEAD_TO="$(json_escape "${LEAD_TO:-}")"
        envsubst '${EMAIL_FROM} ${LEAD_TO}' < "$wf" | jq -c .
      ) | n8n_exec sh -c "cat > $CTMP/workflows/$base"
    else
      jq -c . "$wf" | n8n_exec sh -c "cat > $CTMP/workflows/$base"
    fi
    log "staged $base (id $id)"
  done

  log "importing ${#WORKFLOWS[@]} workflow(s)"
  n8n_exec n8n import:workflow --separate --input="$CTMP/workflows"

  for id in "${IDS[@]}"; do
    log "publishing workflow $id"
    n8n_exec n8n publish:workflow --id="$id"
  done
fi

cleanup

# --- restart so the running instance registers the published webhooks ----------------------------------
log "restarting n8n"
"${DC[@]}" restart n8n
log "waiting for n8n /healthz"
ok=0
for _ in $(seq 1 90); do
  if "${DC[@]}" exec -T n8n wget -qO- http://127.0.0.1:5678/healthz >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || die "n8n did not become healthy within 180 s (check: ${DC[*]} logs n8n)"
log "n8n is healthy"

if [ "${#WORKFLOWS[@]}" -gt 0 ]; then
  active="$(n8n_exec n8n list:workflow --active=true --onlyId 2>/dev/null | tr -d '\r')"
  for id in "${IDS[@]}"; do
    grep -qx "$id" <<<"$active" || die "workflow $id is not active after import"
  done
  log "active workflows: ${IDS[*]}"
fi
log "done"
