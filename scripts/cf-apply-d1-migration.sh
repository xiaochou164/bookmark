#!/usr/bin/env bash
set -euo pipefail

DEFAULT_DB_NAME="${CF_D1_DB_NAME:-rainboard}"

resolve_db_name_from_wrangler() {
  local config_file="wrangler.toml"
  if [[ ! -f "$config_file" ]]; then
    return 1
  fi

  awk '
    BEGIN { in_block=0 }
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*\[\[d1_databases\]\][[:space:]]*$/ { in_block=1; next }
    in_block && /^[[:space:]]*\[/ { in_block=0 }
    in_block && /^[[:space:]]*database_name[[:space:]]*=/ {
      line=$0
      sub(/^[^=]*=[[:space:]]*"/, "", line)
      sub(/".*$/, "", line)
      print line
      exit
    }
  ' "$config_file"
}

if [[ "${1:-}" == "local" || "${1:-}" == "remote" ]]; then
  TARGET="$1"
  DB_NAME="$(resolve_db_name_from_wrangler || true)"
  DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"
  MIGRATION_FILE="${2:-migrations/0001_folders.sql}"
else
  DB_NAME="${1:-}"
  DB_NAME="${DB_NAME:-$(resolve_db_name_from_wrangler || true)}"
  DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"
  TARGET="${2:-local}" # local|remote
  MIGRATION_FILE="${3:-migrations/0001_folders.sql}"
fi

if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "migration file not found: $MIGRATION_FILE" >&2
  exit 1
fi

if [[ "$TARGET" != "local" && "$TARGET" != "remote" ]]; then
  echo "invalid target: $TARGET (expected local|remote)" >&2
  exit 1
fi

if [[ "$TARGET" == "remote" ]]; then
  npx --yes wrangler d1 execute "$DB_NAME" --remote --file "$MIGRATION_FILE"
else
  npx --yes wrangler d1 execute "$DB_NAME" --local --file "$MIGRATION_FILE"
fi

echo "applied $MIGRATION_FILE to $DB_NAME ($TARGET)"
