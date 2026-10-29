#!/usr/bin/env bash
# Production deploy (run on the VPS; idempotent — safe to re-run after every `git push`).
#
# Usage (from any directory; production target is Linux, also parses under Git Bash):
#   bash infra/scripts/deploy.sh                  # git pull --ff-only, build + up with --profile tunnel, wait healthy
#   bash infra/scripts/deploy.sh --no-pull        # skip git pull
#   bash infra/scripts/deploy.sh --no-tunnel      # omit --profile tunnel (e.g. ngrok); CLOUDFLARE_TUNNEL_TOKEN optional
#   bash infra/scripts/deploy.sh --timeout 600    # health wait in seconds (default 300)
#   ENV_FILE=/path/to/prod.env bash infra/scripts/deploy.sh
#
# Uses ONLY compose.yml (never compose.override.yml, which is dev-only).
# Steps:
#   1. preflight: .env present, required vars non-empty (values never printed), N8N_VERSION pinned (not latest),
#      docker compose v2+ and a reachable daemon
#   2. git pull --ff-only (only inside a git work tree with an upstream branch)
#   3. docker compose --env-file .env -f compose.yml [--profile tunnel] up -d --build
#   4. wait until postgres, n8n, api are healthy and web (+ cloudflared) are running
#   5. print public URLs and next steps
set -euo pipefail

# Git Bash: don't rewrite container paths when passed to docker.exe (no-op on Linux)
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy] WARNING:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[deploy] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

PULL=1
TUNNEL=1
TIMEOUT=300
while [ $# -gt 0 ]; do
  case "$1" in
    --no-pull)   PULL=0; shift ;;
    --no-tunnel) TUNNEL=0; shift ;;
    --timeout)   [ $# -ge 2 ] || die "--timeout needs a value (seconds)"; TIMEOUT=$2; shift 2 ;;
    --timeout=*) TIMEOUT=${1#--timeout=}; shift ;;
    -h|--help)   sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done
[[ "$TIMEOUT" =~ ^[0-9]+$ ]] && [ "$TIMEOUT" -gt 0 ] || die "--timeout must be a positive integer (got '$TIMEOUT')"

COMPOSE_FILE_PROD="compose.yml"
ENV_FILE="${ENV_FILE:-.env}"

# --- 1. preflight: env file -------------------------------------------------------------------------------
log "preflight"
[ -f "$COMPOSE_FILE_PROD" ] || die "$COMPOSE_FILE_PROD not found (is $ROOT the repo root?)"
[ -f "$ENV_FILE" ] || die "env file '$ENV_FILE' not found (cp .env.example .env and fill it)"

# Load into plain (non-exported) shell variables so the checks below can read them; compose itself reads
# --env-file. Tolerate CRLF line endings.
# shellcheck disable=SC1090
source <(tr -d '\r' < "$ENV_FILE")

REQUIRED=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB N8N_VERSION N8N_ENCRYPTION_KEY N8N_HOST N8N_WEBHOOK_SECRET PUBLIC_WEB_HOST)
[ "$TUNNEL" = 1 ] && REQUIRED+=(CLOUDFLARE_TUNNEL_TOKEN)
missing=()
for v in "${REQUIRED[@]}"; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
[ "${#missing[@]}" -eq 0 ] || die "required variable(s) empty or missing in $ENV_FILE: ${missing[*]}"

shopt -s nocasematch
[[ "$N8N_VERSION" == latest ]] && { shopt -u nocasematch; die "N8N_VERSION must be pinned to an exact version, not 'latest'"; }
shopt -u nocasematch

for v in OPENAI_API_KEY RESEND_API_KEY EMAIL_FROM LEAD_TO; do
  [ -n "${!v:-}" ] || warn "$v is empty — n8n credentials/workflows imported from it will not work until it is set (then re-run apps/n8n/scripts/import.sh --prod)"
done
[ "${N8N_MOCK:-0}" = 0 ] || warn "N8N_MOCK='${N8N_MOCK}' — the API will return MOCK answers instead of calling n8n (set N8N_MOCK=0 for production)"
for v in N8N_HOST PUBLIC_WEB_HOST; do
  case "${!v}" in
    http://*|https://*|*/*) warn "$v should be a bare hostname (no scheme or path): '${!v}'" ;;
    *example.com) warn "$v is still the placeholder '${!v}'" ;;
  esac
done
[ "$N8N_HOST" != "$PUBLIC_WEB_HOST" ] || warn "N8N_HOST and PUBLIC_WEB_HOST are identical — they need separate tunnel hostnames"

# --- 1b. preflight: docker ----------------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "'docker compose' (v2 plugin) is not available; legacy docker-compose v1 is not supported"
DC_VERSION="$(docker compose version --short 2>/dev/null | tr -d '\r' | sed 's/^v//')"
DC_MAJOR="${DC_VERSION%%.*}"
[[ "$DC_MAJOR" =~ ^[0-9]+$ ]] && [ "$DC_MAJOR" -ge 2 ] || die "docker compose v2+ required (found '${DC_VERSION:-unknown}')"
docker info >/dev/null 2>&1 || die "cannot reach the docker daemon (is it running? is this user in the 'docker' group?)"
HAVE_JQ=0
command -v jq >/dev/null 2>&1 && HAVE_JQ=1
ok "preflight passed (docker compose $DC_VERSION, jq: $([ "$HAVE_JQ" = 1 ] && echo yes || echo 'no, using grep fallback'))"

DC=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE_PROD")
[ "$TUNNEL" = 1 ] && DC+=(--profile tunnel)

# --- 2. git pull --------------------------------------------------------------------------------------------
if [ "$PULL" = 0 ]; then
  log "skipping git pull (--no-pull)"
elif ! command -v git >/dev/null 2>&1 || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "not a git work tree — skipping git pull"
elif ! upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  log "current branch has no upstream — skipping git pull"
else
  log "git pull --ff-only ($upstream)"
  git pull --ff-only || die "git pull --ff-only failed (local commits or diverged history?) — resolve manually or use --no-pull"
  log "now at $(git log -1 --format='%h %s')"
fi

# --- 3. build + up ------------------------------------------------------------------------------------------
log "${DC[*]} up -d --build"
"${DC[@]}" up -d --build

# --- 4. wait for health -------------------------------------------------------------------------------------
HEALTHY_SERVICES=(postgres n8n api)
RUNNING_SERVICES=(web)
[ "$TUNNEL" = 1 ] && RUNNING_SERVICES+=(cloudflared)

# Prints "<service> <state> <health>" per container. `ps --format json` emits an array on older compose
# releases and one object per line on newer ones; `jq` handles both input shapes.
service_status_jq() {
  "${DC[@]}" ps -a --format json 2>/dev/null \
    | jq -r 'if type == "array" then .[] else . end | "\(.Service) \(.State // "-") \(if (.Health // "") == "" then "-" else .Health end)"'
}

# grep fallback: query one service at a time so nested objects (Publishers) can't confuse the match.
service_ok_grep() { # $1 = service, $2 = healthy|running
  local out
  out="$("${DC[@]}" ps -a --format json "$1" 2>/dev/null | tr -d '\r\n')" || return 1
  if [ "$2" = healthy ]; then
    grep -Eq '"Health":[[:space:]]*"healthy"' <<<"$out"
  else
    grep -Eq '"State":[[:space:]]*"running"' <<<"$out"
  fi
}

# Sets PENDING to the services not yet in their wanted state; returns 0 when everything is ready.
check_ready() {
  PENDING=()
  local s status=""
  [ "$HAVE_JQ" = 1 ] && status="$(service_status_jq || true)"
  for s in "${HEALTHY_SERVICES[@]}"; do
    if [ "$HAVE_JQ" = 1 ]; then
      awk -v s="$s" '$1 == s && $3 == "healthy" { f = 1 } END { exit !f }' <<<"$status" || PENDING+=("$s")
    else
      service_ok_grep "$s" healthy || PENDING+=("$s")
    fi
  done
  for s in "${RUNNING_SERVICES[@]}"; do
    if [ "$HAVE_JQ" = 1 ]; then
      awk -v s="$s" '$1 == s && $2 == "running" { f = 1 } END { exit !f }' <<<"$status" || PENDING+=("$s")
    else
      service_ok_grep "$s" running || PENDING+=("$s")
    fi
  done
  [ "${#PENDING[@]}" -eq 0 ]
}

log "waiting up to ${TIMEOUT}s for: ${HEALTHY_SERVICES[*]} healthy; ${RUNNING_SERVICES[*]} running"
start=$SECONDS
last=""
until check_ready; do
  elapsed=$((SECONDS - start))
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    printf '\n' >&2
    warn "timed out after ${elapsed}s; not ready: ${PENDING[*]}"
    "${DC[@]}" ps -a >&2 || true
    for s in "${PENDING[@]}"; do
      printf '\n\033[1;33m----- last 50 log lines: %s -----\033[0m\n' "$s" >&2
      "${DC[@]}" logs --no-color --tail 50 "$s" >&2 || true
    done
    die "deploy did not become healthy (re-run with --timeout N to wait longer)"
  fi
  if [ "${PENDING[*]}" != "$last" ]; then
    log "  ${elapsed}s: waiting for ${PENDING[*]}"
    last="${PENDING[*]}"
  fi
  sleep 5
done
ok "all services ready after $((SECONDS - start))s"

# Quick in-container probe of the API (does not go through nginx or the tunnel).
if health="$("${DC[@]}" exec -T api wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null | tr -d '\r')"; then
  log "api /api/health: $health"
else
  warn "in-container probe of /api/health failed (container reports healthy; check: ${DC[*]} logs api)"
fi

# --- 5. summary ---------------------------------------------------------------------------------------------
cat <<EOF

  Web:  https://${PUBLIC_WEB_HOST}
  n8n:  https://${N8N_HOST}

Next steps
  1. First deploy only: open https://${N8N_HOST}, create the n8n owner account, then
       bash apps/n8n/scripts/import.sh --prod
     (re-run it whenever apps/n8n/workflows/*.json or the API keys / EMAIL_FROM / LEAD_TO in ${ENV_FILE} change)
  2. Upload the hotel PDF at https://${PUBLIC_WEB_HOST}/admin
  3. End-to-end test (from a machine with pnpm + browsers; sends one real lead email):
       E2E_BASE_URL=https://${PUBLIC_WEB_HOST} E2E_MODE=real pnpm e2e:real
  Note: keep LEAD_TO set to your own inbox until the final reviewer test — every lead / e2e run sends real email.
EOF
if [ "$TUNNEL" = 0 ]; then
  cat <<EOF
  --no-tunnel: the public URLs above only work once your own tunnel (e.g. ngrok) points at web:80 and n8n:5678.
  compose.yml publishes no host ports, so a host-side ngrok needs a compose file that maps them.
EOF
fi
