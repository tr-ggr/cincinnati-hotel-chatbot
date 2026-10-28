#!/usr/bin/env bash
# WF2 (hotel/chat) evaluation + retrieval-score calibration (sprint card S2-02).
#
# Usage (from any directory; Git Bash on Windows or bash on Linux):
#   bash infra/scripts/chat-eval.sh
#   bash infra/scripts/chat-eval.sh --prod                  # compose: infra/docker-compose.yml only
#   DOCUMENT_ID=<uuid> bash infra/scripts/chat-eval.sh      # evaluate against a specific document
#   CHAT_URL=http://host:5678/webhook/hotel/chat bash infra/scripts/chat-eval.sh
#
# Posts each question of docs/sample/questions.json straight to the n8n webhook (header x-hotel-secret, empty
# history), prints question / expected / got / category / best_score, then asserts:
#   - >= 9/10 "answered" values match the expected ones
#   - "hi there!"                 -> answered=true, category "Other"
#   - a random document_id        -> the canned fallback sentence with answered=false
# Finally prints the best_score distribution (score = cosine DISTANCE, lower = better; see n8n/README.md).
#
# Exit codes: 0 pass · 1 assertion failure · 2 precondition failed (no chunks, no key, webhook not live, missing tool)
# Requires: bash, curl, jq, docker (for psql in the postgres container).
set -uo pipefail


ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CANNED="I'm sorry, I don't have that information right now."
QUESTIONS_FILE="docs/sample/questions.json"
MIN_MATCHES=9

pre()  { printf '\033[1;33m[chat-eval] PRECONDITION:\033[0m %s\n' "$*" >&2; exit 2; }
log()  { printf '\033[1;34m[chat-eval]\033[0m %s\n' "$*"; }

PROD=0
for arg in "$@"; do
  case "$arg" in
    --prod) PROD=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

for bin in curl jq docker; do
  command -v "$bin" >/dev/null 2>&1 || pre "'$bin' is required but not installed"
done
[ -f "$QUESTIONS_FILE" ] || pre "$QUESTIONS_FILE not found"

ENV_FILE="${ENV_FILE:-.env}"
[ -f "$ENV_FILE" ] || pre "env file '$ENV_FILE' not found"
set -a
# shellcheck disable=SC1090
source <(tr -d '\r' < "$ENV_FILE")
set +a
[ -n "${N8N_WEBHOOK_SECRET:-}" ] || pre "N8N_WEBHOOK_SECRET is empty in $ENV_FILE"

DEFAULT_URL="http://localhost:5678/webhook/hotel/chat"
CHAT_URL="${CHAT_URL:-$DEFAULT_URL}"

if [ -z "${COMPOSE_FILES:-}" ]; then
  COMPOSE_FILES="infra/docker-compose.yml"
  if [ "$PROD" = 0 ] && [ -f infra/compose.override.yml ]; then
    COMPOSE_FILES="$COMPOSE_FILES infra/compose.override.yml"
  fi
fi
DC=(docker compose --env-file "$ENV_FILE")
for f in $COMPOSE_FILES; do DC+=(-f "$f"); done

# --- current document_id (prefer the active ready document if its chunks exist, else any chunk's document) ---
if [ -z "${DOCUMENT_ID:-}" ]; then
  SQL="SELECT COALESCE(
         (SELECT d.id::text FROM documents d
           WHERE d.is_active AND d.status = 'ready'
             AND EXISTS (SELECT 1 FROM chunks c WHERE c.metadata->>'document_id' = d.id::text) LIMIT 1),
         (SELECT metadata->>'document_id' FROM chunks LIMIT 1), '')"
  DOCUMENT_ID="$("${DC[@]}" exec -T postgres psql -U "${POSTGRES_USER:-hotel}" -d "${POSTGRES_DB:-hotel}" -tAc "$SQL" 2>/dev/null | tr -d '\r[:space:]')" \
    || pre "could not query postgres (is the stack running? ${DC[*]} ps)"
fi
[ -n "$DOCUMENT_ID" ] || pre "no chunks: ingest a document with a real OPENAI_API_KEY first (admin upload, or 'pnpm sample:pdf' + POST /api/admin/document)"
# the key is only checked for the real webhook (a CHAT_URL override may point at a test copy of the workflow)
if [ "$CHAT_URL" = "$DEFAULT_URL" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  pre "OPENAI_API_KEY is empty in $ENV_FILE — set it, re-run 'bash infra/scripts/n8n-import.sh', re-ingest the document, then re-run this script"
fi
N_CHUNKS="$("${DC[@]}" exec -T postgres psql -U "${POSTGRES_USER:-hotel}" -d "${POSTGRES_DB:-hotel}" -tAc \
  "SELECT count(*) FROM chunks WHERE metadata->>'document_id' = '${DOCUMENT_ID//\'/}'" 2>/dev/null | tr -d '\r[:space:]')"
log "url: $CHAT_URL"
log "document_id: $DOCUMENT_ID (${N_CHUNKS:-?} chunks)"

# --- HTTP helper: retries while n8n restarts (another import) or the webhook is not yet registered ---------
# post <question> <document_id>  -> sets HTTP_CODE and BODY
post() {
  local payload attempt resp
  payload="$(jq -nc --arg q "$1" --arg d "$2" \
    '{session_id: "00000000-0000-4000-8000-0000000e7a11", message_id: "00000000-0000-4000-8000-0000000e7a12", question: $q, document_id: $d, history: []}')"
  for attempt in 1 2 3 4 5 6; do
    # body and status in one capture (no temp files: portable across Git Bash and Linux)
    resp="$(curl -s -w '\n%{http_code}' --max-time 40 -X POST "$CHAT_URL" \
      -H 'content-type: application/json' -H "x-hotel-secret: $N8N_WEBHOOK_SECRET" -d "$payload")" || true
    HTTP_CODE="${resp##*$'\n'}"
    BODY="${resp%$'\n'*}"
    [ "$BODY" = "$resp" ] && BODY=""
    case "$HTTP_CODE" in
      000|404|502|503) [ "$attempt" -lt 6 ] && sleep 5 ;;
      *) return 0 ;;
    esac
  done
}

# --- liveness: webhook registered and protected ---------------------------------------------------------
probe=""
for _ in $(seq 1 12); do
  probe="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "$CHAT_URL" -H 'content-type: application/json' -d '{}')" || true
  case "$probe" in 000|404|502|503) sleep 5 ;; *) break ;; esac
done
case "$probe" in
  403|401) ;;
  404) pre "webhook not registered (404) — run 'bash infra/scripts/n8n-import.sh'" ;;
  000) pre "n8n not reachable at $CHAT_URL" ;;
  *) pre "unexpected HTTP $probe for an unauthenticated request (expected 403)" ;;
esac

# --- eval -----------------------------------------------------------------------------------------------
trunc() { local s="$1" n="$2"; [ "${#s}" -gt "$n" ] && s="${s:0:$((n-1))}…"; printf '%s' "$s"; }

matches=0; total=0; errors=0
ANS_SCORES=(); UNANS_SCORES=()
printf '\n%-3s %-8s %-8s %-5s %-24s %-24s %-10s %s\n' '#' expected got match 'category (expected)' 'category (got)' best_score question
printf '%s\n' "$(printf '%.0s-' $(seq 1 140))"
n="$(jq length "$QUESTIONS_FILE")"
for i in $(seq 0 $((n - 1))); do
  q="$(jq -r ".[$i].question" "$QUESTIONS_FILE")"
  exp="$(jq -r ".[$i].answered" "$QUESTIONS_FILE")"
  expcat="$(jq -r ".[$i].category" "$QUESTIONS_FILE")"
  total=$((total + 1))
  post "$q" "$DOCUMENT_ID"
  if [ "$HTTP_CODE" != 200 ] || ! jq -e 'has("answered")' <<<"$BODY" >/dev/null 2>&1; then
    errors=$((errors + 1))
    printf '%-3s %-8s %-8s %-5s %-24s %-24s %-10s %s\n' "$((i + 1))" "$exp" "HTTP$HTTP_CODE" 'NO' "$(trunc "$expcat" 24)" '-' '-' "$q"
    printf '      body: %s\n' "$(trunc "$(printf %s "$BODY" | tr -d '\n')" 200)"
    continue
  fi
  got="$(jq -r '.answered' <<<"$BODY")"
  cat="$(jq -r '.category' <<<"$BODY")"
  best="$(jq -r '[.sources[]?.score | numbers] | if length > 0 then min else "n/a" end' <<<"$BODY")"
  ans="$(jq -r '.answer' <<<"$BODY" | tr '\n' ' ')"
  m=NO
  if [ "$got" = "$exp" ]; then m=yes; matches=$((matches + 1)); fi
  if [ "$best" != "n/a" ]; then
    if [ "$exp" = true ]; then ANS_SCORES+=("$best"); else UNANS_SCORES+=("$best"); fi
  fi
  printf '%-3s %-8s %-8s %-5s %-24s %-24s %-10s %s\n' "$((i + 1))" "$exp" "$got" "$m" "$(trunc "$expcat" 24)" "$(trunc "$cat" 24)" "$best" "$q"
  printf '      answer: %s\n' "$(trunc "$ans" 130)"
done
echo
log "answered matches: $matches/$total (need >= $MIN_MATCHES), request errors: $errors"

fail=0
[ "$matches" -ge "$MIN_MATCHES" ] || fail=1

# --- assertion: greeting --------------------------------------------------------------------------------
post "hi there!" "$DOCUMENT_ID"
if [ "$HTTP_CODE" = 200 ] && jq -e '.answered == true and .category == "Other"' <<<"$BODY" >/dev/null 2>&1; then
  log "PASS greeting: 'hi there!' -> answered=true, category=Other ($(jq -r '.answer' <<<"$BODY" | tr '\n' ' '))"
else
  log "FAIL greeting: 'hi there!' -> HTTP $HTTP_CODE $(printf %s "$BODY" | tr -d '\n')"
  fail=1
fi

# --- assertion: unknown document -> canned fallback -----------------------------------------------------
RAND_DOC="$(printf '%04x%04x-%04x-4%03x-a%03x-%04x%04x%04x' $RANDOM $RANDOM $RANDOM $((RANDOM % 4096)) $((RANDOM % 4096)) $RANDOM $RANDOM $RANDOM)"
post "What time is check-in?" "$RAND_DOC"
if [ "$HTTP_CODE" = 200 ] && jq -e --arg c "$CANNED" '.answered == false and .answer == $c' <<<"$BODY" >/dev/null 2>&1; then
  log "PASS unknown document_id $RAND_DOC -> canned fallback, answered=false"
else
  log "FAIL unknown document_id $RAND_DOC -> HTTP $HTTP_CODE $(printf %s "$BODY" | tr -d '\n')"
  fail=1
fi

# --- calibration summary (score = cosine distance: LOWER = more similar) --------------------------------
echo
log "retrieval best_score (cosine distance, lower = better):"
fmt() { if [ "$#" -gt 0 ]; then printf '%s\n' "$@" | sort -g | tr '\n' ' '; else printf '(none)'; fi; }
log "  expected answered   : $(fmt "${ANS_SCORES[@]+"${ANS_SCORES[@]}"}")"
log "  expected unanswered : $(fmt "${UNANS_SCORES[@]+"${UNANS_SCORES[@]}"}")"
if [ "${#ANS_SCORES[@]}" -gt 0 ] && [ "${#UNANS_SCORES[@]}" -gt 0 ]; then
  max_ans="$(printf '%s\n' "${ANS_SCORES[@]}" | sort -g | tail -1)"
  min_unans="$(printf '%s\n' "${UNANS_SCORES[@]}" | sort -g | head -1)"
  if jq -en --argjson a "$max_ans" --argjson u "$min_unans" '$a < $u' >/dev/null; then
    log "  separable: worst answered $max_ans < best unanswered $min_unans -> SCORE_GUARD candidate $(jq -n --argjson a "$max_ans" --argjson u "$min_unans" '(($a + $u) / 2 * 1000 | round) / 1000')"
  else
    log "  NOT separable (worst answered $max_ans >= best unanswered $min_unans) -> keep SCORE_GUARD = 0 (off); rely on the LLM"
  fi
fi

echo
if [ "$fail" = 0 ]; then log "RESULT: PASS"; exit 0; fi
log "RESULT: FAIL"; exit 1
