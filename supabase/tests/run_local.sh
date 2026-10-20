#!/usr/bin/env bash
# Applies supabase_stub.sql + every migration to a throwaway local Postgres
# database, then runs the attack tests. Needs a running Postgres you can
# connect to as a superuser (PGHOST/PGPORT/PGUSER env vars as usual).
#
#   ./supabase/tests/run_local.sh            # creates & drops carwash_sectest
set -euo pipefail

DB="${DB:-carwash_sectest}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"

dropdb --if-exists "$DB"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$HERE/supabase_stub.sql"
for f in "$MIGRATIONS"/*.sql; do
  echo "applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null
done
psql -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/security_0006.sql"
