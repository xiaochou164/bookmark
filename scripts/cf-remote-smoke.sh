#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${CF_BASE_URL:-${1:-}}"

if [[ -z "$BASE_URL" ]]; then
  cat <<'EOF' >&2
Usage:
  bash scripts/cf-remote-smoke.sh <base-url>

Examples:
  bash scripts/cf-remote-smoke.sh https://rainboard.<subdomain>.workers.dev
  CF_BASE_URL=https://rainboard.example.workers.dev bash scripts/cf-remote-smoke.sh

Notes:
  - Uses a temporary account created during the smoke run.
  - Requires only curl and node.
EOF
  exit 1
fi

BASE_URL="${BASE_URL%/}"
COOKIE_JAR="$(mktemp -t rainboard-cf-remote-smoke-cookie.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

SMOKE_EMAIL="smoke.$(date +%s).$RANDOM@example.com"
SMOKE_PASSWORD="password123"

json_get() {
  local path_expr="$1"
  node -e "
    const fs = require('fs');
    const input = fs.readFileSync(0, 'utf8');
    const data = JSON.parse(input || '{}');
    const value = (function () { return ${path_expr}; })();
    if (typeof value === 'undefined') process.exit(2);
    if (value === null) process.stdout.write('null');
    else if (typeof value === 'object') process.stdout.write(JSON.stringify(value));
    else process.stdout.write(String(value));
  "
}

request_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response
  if [[ -n "$body" ]]; then
    response="$(curl -sS -X "$method" \
      -H 'content-type: application/json' \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      --data "$body" \
      "$BASE_URL$path")"
  else
    response="$(curl -sS -X "$method" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "$BASE_URL$path")"
  fi
  printf '%s' "$response"
}

echo "[1/7] health"
HEALTH_JSON="$(request_json GET /api/health)"
HEALTH_OK="$(printf '%s' "$HEALTH_JSON" | json_get "data.ok")"
HEALTH_RUNTIME="$(printf '%s' "$HEALTH_JSON" | json_get "data.runtime")"
if [[ "$HEALTH_OK" != "true" || "$HEALTH_RUNTIME" != "cloudflare-workers" ]]; then
  echo "health check failed: $HEALTH_JSON" >&2
  exit 1
fi

echo "[2/7] register"
REGISTER_JSON="$(request_json POST /api/auth/register "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\",\"displayName\":\"Smoke\"}")"
REGISTER_OK="$(printf '%s' "$REGISTER_JSON" | json_get "data.ok")"
if [[ "$REGISTER_OK" != "true" ]]; then
  echo "register failed: $REGISTER_JSON" >&2
  exit 1
fi

echo "[3/7] auth me"
ME_JSON="$(request_json GET /api/auth/me)"
ME_EMAIL="$(printf '%s' "$ME_JSON" | json_get "data.user && data.user.email")"
if [[ "$ME_EMAIL" != "$SMOKE_EMAIL" ]]; then
  echo "auth me failed: $ME_JSON" >&2
  exit 1
fi

echo "[4/7] create folder + bookmark"
FOLDER_JSON="$(request_json POST /api/folders '{"name":"Smoke Folder"}')"
FOLDER_ID="$(printf '%s' "$FOLDER_JSON" | json_get "data.id")"
if [[ -z "$FOLDER_ID" || "$FOLDER_ID" == "null" ]]; then
  echo "folder create failed: $FOLDER_JSON" >&2
  exit 1
fi

BOOKMARK_JSON="$(request_json POST /api/bookmarks "{\"title\":\"Smoke Bookmark\",\"url\":\"https://example.com\",\"folderId\":\"$FOLDER_ID\",\"tags\":[\"smoke\"]}")"
BOOKMARK_ID="$(printf '%s' "$BOOKMARK_JSON" | json_get "data.id")"
if [[ -z "$BOOKMARK_ID" || "$BOOKMARK_ID" == "null" ]]; then
  echo "bookmark create failed: $BOOKMARK_JSON" >&2
  exit 1
fi

echo "[5/7] state + tags"
STATE_JSON="$(request_json GET /api/state)"
STATE_TOTAL="$(printf '%s' "$STATE_JSON" | json_get "data.stats && data.stats.total")"
TAGS_JSON="$(request_json GET /api/tags)"
HAS_SMOKE_TAG="$(printf '%s' "$TAGS_JSON" | json_get "Array.isArray(data.items) && data.items.some((item) => (item.name || item.tag) === 'smoke')")"
if [[ "$STATE_TOTAL" == "0" || "$HAS_SMOKE_TAG" != "true" ]]; then
  echo "state/tags validation failed" >&2
  echo "state: $STATE_JSON" >&2
  echo "tags: $TAGS_JSON" >&2
  exit 1
fi

echo "[6/7] public link"
PUBLIC_JSON="$(request_json POST /api/collab/public-links "{\"folderId\":\"$FOLDER_ID\",\"title\":\"Smoke Public\"}")"
PUBLIC_TOKEN="$(printf '%s' "$PUBLIC_JSON" | json_get "data.item && data.item.token")"
if [[ -z "$PUBLIC_TOKEN" || "$PUBLIC_TOKEN" == "null" ]]; then
  echo "public link create failed: $PUBLIC_JSON" >&2
  exit 1
fi

PUBLIC_READ_JSON="$(curl -sS "$BASE_URL/public/c/$PUBLIC_TOKEN.json")"
PUBLIC_OK="$(printf '%s' "$PUBLIC_READ_JSON" | json_get "data.ok")"
PUBLIC_LINK_TOKEN="$(printf '%s' "$PUBLIC_READ_JSON" | json_get "data.link && data.link.token")"
if [[ "$PUBLIC_OK" != "true" || "$PUBLIC_LINK_TOKEN" != "$PUBLIC_TOKEN" ]]; then
  echo "public link read failed: $PUBLIC_READ_JSON" >&2
  exit 1
fi

echo "[7/7] io task"
IO_JSON="$(request_json POST /api/io/tasks '{"type":"export_json","input":{}}')"
IO_TASK_ID="$(printf '%s' "$IO_JSON" | json_get "data.task && data.task.id")"
if [[ -z "$IO_TASK_ID" || "$IO_TASK_ID" == "null" ]]; then
  echo "io task create failed: $IO_JSON" >&2
  exit 1
fi

echo "cf-remote-smoke: ok"
echo "base_url=$BASE_URL"
echo "email=$SMOKE_EMAIL"
