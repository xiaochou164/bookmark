#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${CF_D1_DB_NAME:-rainboard}"
SKIP_CHECKS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-name)
      DB_NAME="${2:-$DB_NAME}"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/cf-release.sh [--db-name <name>] [--skip-checks]

One-command Cloudflare release pipeline:
1) Worker syntax/smoke checks
2) Ensure D1 exists and patch wrangler.toml
3) Apply local + remote D1 migration
4) Deploy worker

Prerequisites:
- npm dependencies installed (wrangler available via npx/local)
- wrangler authenticated (e.g. `npx wrangler login`)
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$SKIP_CHECKS" != "1" ]]; then
  npm run cf:check
  npm run cf:smoke
fi

node scripts/cf-ensure-d1-binding.mjs "$DB_NAME"
bash scripts/cf-apply-d1-migration.sh "$DB_NAME" local
bash scripts/cf-apply-d1-migration.sh "$DB_NAME" remote
npx --yes wrangler deploy

echo "Cloudflare release completed for D1 database: $DB_NAME"
