#!/usr/bin/env bash
# SaaS §D5 rehearsal (docs/SAAS_MULTI_TENANCY.md §J-10/11; Phase 7).
#
# Restores a production backup into a throwaway database, brings it to the
# current migrations, applies the D5 contract, and checks that nothing but the
# constraints changed: row counts per table, foreign keys, money totals. Then
# runs the rollback drill (restore the same backup into a second database and
# compare) and prints the timings.
#
# It never touches the database it restores FROM: it only reads a dump file.
# The target must be a database whose name ends in "_rehearsal", on localhost
# unless --allow-remote is given. NEVER point it at production or vps_dev.
#
# Usage:
#   scripts/saas/rehearse-d5.sh --dump nexa-db-2026-11-05.sql.gz \
#     --target-url postgresql://user:pass@127.0.0.1:5432/nexa_d5_rehearsal
#
# Needs psql (set PSQL="docker exec -i <container> psql" to use a container's)
# and gunzip. The backup is the plain-SQL gzip that scripts/backup_db.sh writes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACT="$ROOT/apps/api/prisma/contract/d5_saas_drop_global_uniques/migration.sql"
PSQL="${PSQL:-psql}"
DUMP=""
TARGET_URL=""
ALLOW_REMOTE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="$2"; shift 2 ;;
    --target-url) TARGET_URL="$2"; shift 2 ;;
    --allow-remote) ALLOW_REMOTE=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -f "$DUMP" ] || { echo "Give --dump <backup .sql.gz>." >&2; exit 2; }
[ -f "$CONTRACT" ] || { echo "Contract not found: $CONTRACT" >&2; exit 2; }
[ -n "$TARGET_URL" ] || { echo "Give --target-url." >&2; exit 2; }

# ── Guards: a throwaway database, never production ─────────────────────────
DB_NAME="$(printf '%s' "$TARGET_URL" | sed -E 's|^.*/([^/?]+)(\?.*)?$|\1|')"
DB_HOST="$(printf '%s' "$TARGET_URL" | sed -E 's|^[a-z]+://([^@]*@)?([^:/]+).*$|\2|')"
case "$DB_NAME" in
  *_rehearsal) ;;
  *) echo "Refusing: the target database name must end in _rehearsal (got '$DB_NAME')." >&2; exit 3 ;;
esac
if [ "$ALLOW_REMOTE" -ne 1 ] && [ "$DB_HOST" != "127.0.0.1" ] && [ "$DB_HOST" != "localhost" ]; then
  echo "Refusing: target host '$DB_HOST' is not local (pass --allow-remote for a staging server)." >&2
  exit 3
fi
for name in nexa_chess vps_dev vps_dev_saas; do
  [ "$DB_NAME" = "$name" ] && { echo "Refusing: '$DB_NAME' is a live database." >&2; exit 3; }
done

ADMIN_URL="$(printf '%s' "$TARGET_URL" | sed -E "s|/${DB_NAME}(\?.*)?$|/postgres\1|")"
RB_NAME="${DB_NAME}_rb"
RB_URL="$(printf '%s' "$TARGET_URL" | sed -E "s|/${DB_NAME}(\?.*)?$|/${RB_NAME}\1|")"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/d5-rehearsal.XXXXXX")"
REPORT="$OUT/report.txt"
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$REPORT"; }
q() { $PSQL "$1" -v ON_ERROR_STOP=1 -X -q -At -c "$2"; }

recreate() { # $1 = database name
  q "$ADMIN_URL" "DROP DATABASE IF EXISTS \"$1\" WITH (FORCE);"
  q "$ADMIN_URL" "CREATE DATABASE \"$1\";"
}

restore() { # $1 = url
  gunzip -c "$DUMP" | $PSQL "$1" -v ON_ERROR_STOP=1 -X -q >/dev/null
}

migrate() { # $1 = url
  (cd "$ROOT/apps/api" && DATABASE_URL="$1" npx prisma migrate deploy --schema prisma/schema.prisma >/dev/null)
}

# Row counts of every table, one "table count" line each, sorted.
snapshot_counts() { # $1 = url
  q "$1" "SELECT format('SELECT %L, count(*) FROM public.%I;', table_name, table_name)
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
          ORDER BY 1" | $PSQL "$1" -X -q -At -F ' ' | sort
}

# Sum of every integer money column (amounts in minor units, totals), per table.
snapshot_money() { # $1 = url
  q "$1" "SELECT format('SELECT %L, coalesce(sum(%I), 0) FROM public.%I;', table_name || '.' || column_name, column_name, table_name)
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND data_type IN ('integer', 'bigint', 'numeric')
            AND (column_name ILIKE '%amount%' OR column_name ILIKE '%total%' OR column_name ILIKE '%minor%')
          ORDER BY 1" | $PSQL "$1" -X -q -At -F ' ' | sort
}

snapshot_fk() { # $1 = url: foreign keys not validated (must be none)
  q "$1" "SELECT conrelid::regclass || ' ' || conname FROM pg_constraint WHERE contype = 'f' AND NOT convalidated ORDER BY 1"
}

timed() { # $1 = label, rest = command
  local label="$1"; shift
  local start; start=$(date +%s)
  "$@"
  log "$label: $(( $(date +%s) - start )) s"
}

log "D5 rehearsal into $DB_NAME (dump: $(basename "$DUMP"))"
timed "recreate" recreate "$DB_NAME"
timed "restore" restore "$TARGET_URL"
timed "migrate deploy (D1-D4 and later)" migrate "$TARGET_URL"

snapshot_counts "$TARGET_URL" > "$OUT/counts.before"
snapshot_money "$TARGET_URL" > "$OUT/money.before"
log "tables: $(wc -l < "$OUT/counts.before"), rows: $(awk '{s+=$2} END {print s+0}' "$OUT/counts.before")"

# Every row has an academy before the default changes.
NULL_TENANTS=$(q "$TARGET_URL" "SELECT format('SELECT count(*) FROM public.%I WHERE \"tenantId\" IS NULL', table_name)
  FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'" \
  | sed 's/$/;/' | $PSQL "$TARGET_URL" -X -q -At | awk '{s+=$1} END {print s+0}')
log "rows without an academy: $NULL_TENANTS"
[ "$NULL_TENANTS" -eq 0 ] || { log "FAIL: rows without tenantId"; exit 1; }

timed "D5 contract" q "$TARGET_URL" "$(cat "$CONTRACT")"

snapshot_counts "$TARGET_URL" > "$OUT/counts.after"
snapshot_money "$TARGET_URL" > "$OUT/money.after"
snapshot_fk "$TARGET_URL" > "$OUT/fk.after"
FAILED=0
if diff -u "$OUT/counts.before" "$OUT/counts.after" > "$OUT/counts.diff"; then log "row counts: identical"; else log "FAIL: row counts changed ($OUT/counts.diff)"; FAILED=1; fi
if diff -u "$OUT/money.before" "$OUT/money.after" > "$OUT/money.diff"; then log "money totals: identical"; else log "FAIL: money totals changed ($OUT/money.diff)"; FAILED=1; fi
if [ -s "$OUT/fk.after" ]; then log "FAIL: unvalidated foreign keys ($OUT/fk.after)"; FAILED=1; else log "foreign keys: all validated"; fi

DEFAULTS=$(q "$TARGET_URL" "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'
  AND column_default IS NOT NULL AND column_default NOT LIKE 'nexa_tenant_required()%'")
log "tenantId columns defaulting to anything but nexa_tenant_required(): $DEFAULTS"
[ "$DEFAULTS" -eq 0 ] || FAILED=1
# A row written without an academy must now fail (rolled back either way).
if q "$TARGET_URL" "BEGIN; INSERT INTO tenant_brandings (id, \"updatedAt\") VALUES ('d5-probe', now()); ROLLBACK;" >/dev/null 2>&1; then
  log "FAIL: an insert without tenantId was accepted"; FAILED=1
else
  log "an insert without tenantId is refused"
fi
SEQ_PKS=$(q "$TARGET_URL" "SELECT count(*) FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  WHERE c.contype = 'p' AND c.conrelid::regclass::text IN ('invoice_sequences', 'credit_note_sequences', 'payslip_sequences')
  AND array_length(c.conkey, 1) = 2 AND a.attname = 'tenantId'")
log "number sequences keyed by (tenantId, year): $SEQ_PKS of 3"
[ "$SEQ_PKS" -eq 3 ] || FAILED=1
GLOBAL_LEFT=$(q "$TARGET_URL" "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname IN
  ('users_email_key', 'users_username_key', 'invoices_number_key', 'plans_code_key', 'puzzle_topics_name_key', 'referral_stages_trigger_automatic_key')")
log "sampled global uniques left: $GLOBAL_LEFT (want 0)"
[ "$GLOBAL_LEFT" -eq 0 ] || FAILED=1

# Rollback drill: the only way back from D5 is the backup (§J-11).
log "rollback drill into $RB_NAME"
timed "rollback: recreate" recreate "$RB_NAME"
timed "rollback: restore" restore "$RB_URL"
timed "rollback: migrate deploy" migrate "$RB_URL"
snapshot_counts "$RB_URL" > "$OUT/counts.rollback"
if diff -q "$OUT/counts.before" "$OUT/counts.rollback" >/dev/null; then log "rollback: row counts match the pre-D5 database"; else log "FAIL: rollback row counts differ"; FAILED=1; fi
q "$ADMIN_URL" "DROP DATABASE IF EXISTS \"$RB_NAME\" WITH (FORCE);"

if [ "$FAILED" -eq 0 ]; then log "RESULT: PASS ($DB_NAME kept for e2e; report in $OUT)"; else log "RESULT: FAIL (details in $OUT)"; fi
exit "$FAILED"
