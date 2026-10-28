#!/usr/bin/env bash
# Post a fake lead + 2-message transcript to WF3 (hotel/lead) and check that Resend accepted the email.
#
# Usage: bash infra/scripts/lead-test.sh [--url http://localhost:5678/webhook/hotel/lead]
# Exit: 0 = .ok==true and .email_id non-empty; 1 = request failed / bad response; 2 = refused (unsafe or missing config)
#
# Safety: refuses to run if LEAD_TO is empty or points at the reviewer addresses (tauga.ai / deleonajiraydiego).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

URL="http://localhost:5678/webhook/hotel/lead"
while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="${2:?--url needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

ENV_FILE="${ENV_FILE:-.env}"
[ -f "$ENV_FILE" ] || { echo "[lead-test] $ENV_FILE not found" >&2; exit 2; }
set -a
# shellcheck disable=SC1090
source <(tr -d '\r' < "$ENV_FILE")
set +a

if [ -z "${LEAD_TO:-}" ]; then
  echo "[lead-test] REFUSING: LEAD_TO is empty in $ENV_FILE. Set it to your own test inbox, re-run n8n-import.sh, then retry." >&2
  exit 2
fi
if printf '%s' "$LEAD_TO" | grep -qiE 'tauga\.ai|deleonajiraydiego'; then
  echo "[lead-test] REFUSING: LEAD_TO contains a reviewer address. Use your own inbox while testing." >&2
  exit 2
fi
[ -n "${N8N_WEBHOOK_SECRET:-}" ] || { echo "[lead-test] N8N_WEBHOOK_SECRET is empty" >&2; exit 2; }

command -v jq >/dev/null || { echo "[lead-test] jq is required" >&2; exit 2; }
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PAYLOAD="$(jq -n --arg now "$NOW" '{
  lead: { name: "Test Guest", phone: "+1 555 0100", email: "test.guest@example.com" },
  session_id: "00000000-0000-4000-8000-000000000003",
  unanswered_question: "Is there a helipad on the roof?",
  transcript: [
    { role: "user", content: "Is there a helipad on the roof?", created_at: $now },
    { role: "assistant", content: "I'"'"'m sorry, I don'"'"'t have that information right now.", created_at: $now }
  ]
}')"

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
CODE="$(curl -sS -m 90 -o "$BODY_FILE" -w '%{http_code}' -X POST "$URL" \
  -H 'Content-Type: application/json' -H "x-hotel-secret: ${N8N_WEBHOOK_SECRET}" \
  --data "$PAYLOAD")" || { echo "[lead-test] request failed (is n8n up?)" >&2; exit 1; }

echo "HTTP $CODE"
jq . "$BODY_FILE" 2>/dev/null || cat "$BODY_FILE"

if [ "$CODE" != "200" ]; then
  echo "[lead-test] FAIL: expected HTTP 200" >&2
  exit 1
fi
if jq -e '.ok == true and ((.email_id // "") | tostring | length > 0)' "$BODY_FILE" >/dev/null 2>&1; then
  echo "[lead-test] PASS: email_id=$(jq -r .email_id "$BODY_FILE") — check the inbox for LEAD_TO"
  exit 0
fi
echo "[lead-test] FAIL: response lacks ok==true and a non-empty email_id" >&2
exit 1
