#!/usr/bin/env bash
# Full end-to-end run without Docker: fresh Postgres DB + local Supabase
# stand-in + production build of the app + Playwright.
# Requires a PostgreSQL server (TEST_PG_URL, default postgres://postgres@localhost:54329).
set -euo pipefail
cd "$(dirname "$0")/.."
PG=${TEST_PG_URL:-postgres://postgres@localhost:54329}
export DATABASE_URL="$PG/crm_e2e"
node scripts/local-supabase/reset-db.mjs

node scripts/local-supabase/server.mjs > /tmp/local-supabase.log 2>&1 &
SHIM=$!
trap 'kill $SHIM ${APP:-} 2>/dev/null || true' EXIT
sleep 1
ANON=$(grep ANON_KEY /tmp/local-supabase.log | cut -d= -f2)
SERVICE=$(grep SERVICE_ROLE_KEY /tmp/local-supabase.log | cut -d= -f2)

export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
export SUPABASE_SERVICE_ROLE_KEY=$SERVICE
export NEXT_PUBLIC_SITE_URL=http://localhost:3100
export QUOTE_LINK_SECRET=local-quote-link-secret-0123456789abcdef
export APP_SECRET=local-app-secret-0123456789abcdef-0123
export COMPANY_NAME="Summit Auto Transport"
unset RESEND_API_KEY EMAIL_FROM

npx next build > /tmp/next-build.log 2>&1
npx next start -p 3100 > /tmp/next-e2e.log 2>&1 &
APP=$!
for i in $(seq 1 30); do curl -sf http://localhost:3100/get-a-quote > /dev/null && break; sleep 1; done
E2E_BASE_URL=http://localhost:3100 npx playwright test --trace off "$@"
