#!/usr/bin/env bash
# Scripted smoke test (ARCHITECTURE §8 step 3).
#
# Usage: bash infra/scripts/smoke.sh [--base URL] [--mock] [--only upload,chat,lead,stats,sse]
#   --base URL   default http://localhost:8080
#   --mock       N8N_MOCK mode: relaxes content assertions (chunkCount == 42, category just valid)
#   --only LIST  comma-separated subset of: upload,chat,lead,stats,sse (health always runs)
#
# Requires: bash, curl, jq. Runs under Git Bash on Windows and bash on Linux.
set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PDF="$SCRIPT_DIR/../../docs/sample/cincinnati-hotel.pdf"

BASE="http://localhost:8080"
MODE="real"
ONLY=""

CATEGORIES=(
  "Rooms"
  "Restaurant & Dining"
  "Amenities & Facilities"
  "Pricing & Booking"
  "Location & Transport"
  "Policies"
  "Events"
  "Other"
)
CANNED="I'm sorry, I don't have that information right now."
CHECKIN_Q="What time is check-in?"
HELIPAD_Q="Is there a helipad on the roof?"

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --base) [ $# -ge 2 ] || { echo "--base needs a value" >&2; exit 2; }; BASE=$2; shift 2 ;;
    --base=*) BASE=${1#--base=}; shift ;;
    --mock) MODE="mock"; shift ;;
    --only) [ $# -ge 2 ] || { echo "--only needs a value" >&2; exit 2; }; ONLY=$(printf '%s' "$2" | tr -d ' '); shift 2 ;;
    --only=*) ONLY=$(printf '%s' "${1#--only=}" | tr -d ' '); shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
BASE=${BASE%/}

if [ -n "$ONLY" ]; then
  for s in ${ONLY//,/ }; do
    case "$s" in
      upload|chat|lead|stats|sse) ;;
      *) echo "Unknown step in --only: $s (valid: upload,chat,lead,stats,sse)" >&2; exit 2 ;;
    esac
  done
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but was not found on PATH." >&2
  echo "  Install: Windows -> download jq-windows-amd64.exe from https://jqlang.org/download/ into ~/bin/jq.exe" >&2
  echo "           Debian/Ubuntu -> sudo apt-get install jq    macOS -> brew install jq" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found on PATH." >&2
  exit 2
fi

# Run a step only if selected (empty --only means all).
want() {
  [ -z "$ONLY" ] && return 0
  case ",$ONLY," in *",$1,"*) return 0 ;; esac
  return 1
}

TMP=$(mktemp -d) || { echo "mktemp failed" >&2; exit 2; }
trap 'rm -rf "$TMP"' EXIT
BODY="$TMP/body.json"
CURL_ERR="$TMP/curl.err"

# Convert a POSIX path to a native Windows path when running under Git Bash,
# so native curl.exe can open it.
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

fail() {
  # fail STEP MESSAGE
  echo "FAIL $1: $2"
  exit 1
}

pass() {
  echo "PASS $1: $2"
}

# http METHOD URL [curl args...]
# Sets HTTP_CODE and writes the response body to $BODY.
http() {
  local method=$1 url=$2
  shift 2
  local rc=0
  HTTP_CODE=$(curl -sS -X "$method" -o "$(native_path "$BODY")" -w '%{http_code}' "$@" "$url" 2>"$CURL_ERR") || rc=$?
  if [ "$rc" -ne 0 ]; then
    HTTP_CODE="000"
    echo "curl error ($method $url): $(cat "$CURL_ERR")" >&2
    return 1
  fi
  return 0
}

# expect_code STEP EXPECTED — fails with status + body if HTTP_CODE differs.
expect_code() {
  if [ "$HTTP_CODE" != "$2" ]; then
    fail "$1" "expected HTTP $2, got HTTP $HTTP_CODE: $(head -c 500 "$BODY" 2>/dev/null)"
  fi
}

# jqp STEP EXPR — fails with the body if the jq boolean expression is not true.
jqp() {
  if ! jq -e "$2" < "$BODY" >/dev/null 2>&1; then
    fail "$1" "assertion failed [$2]: $(head -c 500 "$BODY")"
  fi
}

jqv() {
  jq -r "$1" < "$BODY"
}

valid_category() {
  local c=$1 x
  for x in "${CATEGORIES[@]}"; do
    [ "$c" = "$x" ] && return 0
  done
  return 1
}

SESSION_ID=""
ensure_session() {
  if [ -n "$SESSION_ID" ]; then return 0; fi
  http POST "$BASE/api/sessions" -H 'content-type: application/json' -d '{}' --max-time 20 || fail "session" "request failed"
  expect_code "session" 201
  SESSION_ID=$(jqv '.id')
  [ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ] || fail "session" "no id in response"
}

echo "Smoke test: mode=$MODE base=$BASE only=${ONLY:-all}"

# ---- health (always) ----
http GET "$BASE/api/health" --max-time 15 || fail "health" "request failed"
expect_code "health" 200
jqp "health" '.ok == true and .db == "up"'
pass "health" "200, db=up, n8n=$(jqv '.n8n')"

# ---- upload ----
if want upload; then
  [ -f "$PDF" ] || fail "upload" "sample PDF not found at $PDF"
  http POST "$BASE/api/admin/document" -F "file=@$(native_path "$PDF");type=application/pdf" --max-time 200 \
    || fail "upload" "request failed"
  expect_code "upload" 200
  jqp "upload" '.document.status == "ready"'
  if [ "$MODE" = "mock" ]; then
    jqp "upload" '.document.chunkCount == 42'
  else
    jqp "upload" '.document.chunkCount > 10'
  fi
  pass "upload" "status=ready chunkCount=$(jqv '.document.chunkCount')"
fi

# ---- chat (needs an active ready document) ----
if want chat; then
  http GET "$BASE/api/admin/document" --max-time 15 || fail "chat" "could not read active document"
  expect_code "chat" 200
  if ! jq -e '.document != null and .document.status == "ready"' < "$BODY" >/dev/null 2>&1; then
    fail "chat" "no ready document is active; run the upload step (drop --only upload filter or include upload) first"
  fi

  ensure_session

  # Answerable question
  BODY_JSON=$(jq -cn --arg c "$CHECKIN_Q" '{content: $c}')
  http POST "$BASE/api/sessions/$SESSION_ID/messages" -H 'content-type: application/json' -d "$BODY_JSON" --max-time 40 \
    || fail "chat" "request failed for: $CHECKIN_Q"
  expect_code "chat" 200
  jqp "chat" '.assistantMessage.answered == true and .offerContactForm == false'
  CAT=$(jqv '.assistantMessage.category')
  valid_category "$CAT" || fail "chat" "invalid category '$CAT' for check-in question"
  if [ "$MODE" = "real" ]; then
    jqp "chat" '.assistantMessage.content | contains("3")'
    case "$CAT" in
      "Pricing & Booking"|"Policies") ;;
      *) fail "chat" "check-in category '$CAT' not in {Pricing & Booking, Policies}" ;;
    esac
  fi
  pass "chat" "check-in answered=true category=$CAT"

  # Unanswerable question
  BODY_JSON=$(jq -cn --arg c "$HELIPAD_Q" '{content: $c}')
  http POST "$BASE/api/sessions/$SESSION_ID/messages" -H 'content-type: application/json' -d "$BODY_JSON" --max-time 40 \
    || fail "chat" "request failed for: $HELIPAD_Q"
  expect_code "chat" 200
  jqp "chat" '.assistantMessage.answered == false and .offerContactForm == true'
  CONTENT=$(jqv '.assistantMessage.content')
  [ "$CONTENT" = "$CANNED" ] || fail "chat" "helipad answer is not the canned fallback: '$CONTENT'"
  pass "chat" "helipad answered=false, canned fallback, offerContactForm=true"
fi

# ---- lead (requires a session) ----
if want lead; then
  ensure_session
  LEAD_JSON=$(jq -cn --arg sid "$SESSION_ID" --arg q "$HELIPAD_Q" '{
    sessionId: $sid,
    name: "Smoke Test",
    phone: "+1 513 555 0100",
    email: "smoke@example.com",
    unansweredQuestion: $q
  }')
  http POST "$BASE/api/leads" -H 'content-type: application/json' -d "$LEAD_JSON" --max-time 90 \
    || fail "lead" "request failed"
  expect_code "lead" 201
  jqp "lead" '.emailStatus == "sent"'
  pass "lead" "201, emailStatus=sent"
fi

# ---- stats ----
if want stats; then
  http GET "$BASE/api/admin/stats" --max-time 15 || fail "stats" "request failed"
  expect_code "stats" 200
  SUMMARY=$(jq -c '{totalSessions, totalQuestions, unansweredQuestions, totalLeads, categories: (.byCategory | length)}' < "$BODY" 2>/dev/null)
  jqp "stats" '.totalSessions >= 1 and .totalQuestions >= 2 and .unansweredQuestions >= 1 and .totalLeads >= 1'
  jqp "stats" '(.byCategory | length) == 8'
  pass "stats" "$SUMMARY"
fi

# ---- sse ----
if want sse; then
  # curl exits 28 on --max-time; that is expected, so only grep's result matters here.
  SSE_HIT=$(curl -sN --max-time 4 "$BASE/api/admin/stats/stream" 2>/dev/null | grep -m1 'event: stats')
  if [ -n "$SSE_HIT" ]; then
    pass "sse" "received 'event: stats'"
  else
    fail "sse" "no 'event: stats' received from $BASE/api/admin/stats/stream within 4s"
  fi
fi

echo "SMOKE PASS (mode=$MODE, base=$BASE)"
exit 0
