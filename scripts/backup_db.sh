#!/bin/bash
set -euo pipefail

# ==============================================================================
# Nexa Database Backup Script (OCI Object Storage)
# ==============================================================================
# This script performs a pg_dump of the production database running in Docker,
# compresses it, and uploads it to an Oracle Cloud (OCI) Object Storage bucket
# using the S3 compatibility API. It also handles a 14-day retention policy.
#
# Usage:
#   backup_db.sh                              nightly backup (cron), 14-day retention
#   backup_db.sh --predeploy <label> <dir>    right before a production migration
#                                             (scripts/deploy-production.sh): goes to
#                                             database/predeploy/, a copy stays in <dir>
#                                             (newest 5 kept), prints BACKUP_KEY=<key>
#
# Either way the dump is checked before it counts (gzip intact, pg_dump's
# completion marker present, uploaded size equal to the local file); any
# failure exits non-zero, so a deploy never migrates without a good backup.
# ==============================================================================

MODE=automatic
if [ "${1:-}" = "--predeploy" ]; then
  MODE=predeploy
  LABEL=$(printf '%s' "${2:-}" | tr -cd 'A-Za-z0-9._-')
  LOCAL_COPY_DIR="${3:-}"
  if [ -z "$LABEL" ] || [ -z "$LOCAL_COPY_DIR" ]; then
    echo "Usage: $0 --predeploy <label> <local-copy-dir>"
    exit 1
  fi
fi

# Ensure standard and user bin paths (including oci cli location) are available in non-interactive cron shells
export PATH="/home/ubuntu/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

# Ensure script resolves its own location for proper environment loading in cron
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables explicitly
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
else
  echo "Error: .env file not found at $ROOT_DIR/.env"
  exit 1
fi

# Configuration Defaults (derived from docker-compose if not set in .env)
DB_CONTAINER="nexa_postgres"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-nexa_chess}"

# Validate OCI Variables
if [ -z "${OCI_REGION:-}" ] || [ -z "${OCI_NAMESPACE:-}" ] || [ -z "${OCI_BUCKET_NAME:-}" ] || [ -z "${OCI_ACCESS_KEY_ID:-}" ] || [ -z "${OCI_SECRET_ACCESS_KEY:-}" ]; then
  echo "Error: OCI environment variables are missing."
  exit 1
fi

REGION="$OCI_REGION"
NAMESPACE="$OCI_NAMESPACE"
BUCKET="$OCI_BUCKET_NAME"
ENDPOINT="https://${NAMESPACE}.compat.objectstorage.${REGION}.oci.customer-oci.com"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# OCI CLI authentication uses its native configuration (~/.oci/config)
# which the user has confirmed is already set up on the VPS.
# We no longer need to export AWS credentials for this script.

DATE=$(date +%Y-%m-%d-%H-%M-%S)
if [ "$MODE" = "predeploy" ]; then
  FILENAME="nexa-db-predeploy-${DATE}-${LABEL}.sql.gz"
else
  FILENAME="nexa-db-${DATE}.sql.gz"
fi
# Owner-only and unpredictable: the dump holds every user's data.
umask 077
TEMP_FILE=$(mktemp --suffix=.sql.gz "/tmp/nexa-db-${DATE}.XXXXXX")
REMOTE_PATH="database/${MODE}/${FILENAME}"

# Trap for cleanup
cleanup() {
  if [ -f "$TEMP_FILE" ]; then
    echo "Cleaning up temporary file $TEMP_FILE..."
    rm -f "$TEMP_FILE"
  fi
}
trap cleanup EXIT

echo "Starting automated database backup at $(date)..."

# 1. Verify Docker container is running
if ! docker ps --format '{{.Names}}' | grep -Eq "^${DB_CONTAINER}\$"; then
  echo "Error: Database container '$DB_CONTAINER' is not running."
  exit 1
fi

# 2. Run pg_dump and compress
# The Lichess puzzle catalogue (~6M rows) is re-loadable source data, not a
# NexaChess-owned record: its table definition is dumped, its rows are not.
# lichess_catalogue_releases IS dumped, so a restored database names the
# release to reload (docs/DATABASE_RESTORE.md § "Lichess puzzle catalogue").
# Keep in step with EXCLUDED_TABLE_DATA in apps/api/src/backup/backup.service.ts.
echo "Dumping and compressing database '$DB_NAME'..."
docker exec -i "$DB_CONTAINER" pg_dump -U "$DB_USER" \
  --exclude-table-data=lichess_puzzles \
  --exclude-table-data=lichess_puzzles_staging \
  "$DB_NAME" | gzip > "$TEMP_FILE"

# Verify file was created and is not empty
if [ ! -s "$TEMP_FILE" ]; then
  echo "Error: Backup file is empty or failed to create."
  exit 1
fi
echo "Backup created locally: $TEMP_FILE ($(du -h "$TEMP_FILE" | cut -f1))"

# Integrity: a dump cut short (disk full, container restart, killed pg_dump)
# can still be a non-empty, valid gzip. pg_dump writes this marker last.
echo "Checking the dump is complete..."
if ! gzip -t "$TEMP_FILE"; then
  echo "Error: the backup file is not a valid gzip."
  exit 1
fi
if ! gzip -dc "$TEMP_FILE" | tail -n 20 | grep -q -- "-- PostgreSQL database dump complete"; then
  echo "Error: the dump has no completion marker; pg_dump did not finish."
  exit 1
fi
LOCAL_BYTES=$(stat -c %s "$TEMP_FILE")
echo "Dump is complete (${LOCAL_BYTES} bytes)."

# 3. Upload to OCI Object Storage
echo "Uploading backup to OCI Object Storage using OCI CLI..."
oci os object put -ns "$NAMESPACE" -bn "$BUCKET" --name "$REMOTE_PATH" --file "$TEMP_FILE"

# 4. Verify Upload via Head-Object
echo "Verifying the uploaded object in OCI..."
if ! HEAD_JSON=$(oci os object head -ns "$NAMESPACE" -bn "$BUCKET" --name "$REMOTE_PATH" 2>/dev/null); then
  echo "Error: Verification failed. The object '$REMOTE_PATH' was not found in OCI."
  exit 1
fi
REMOTE_BYTES=$(printf '%s' "$HEAD_JSON" | grep -o '"content-length": *"\?[0-9]*' | tr -dc '0-9')
if [ "$REMOTE_BYTES" != "$LOCAL_BYTES" ]; then
  echo "Error: uploaded size (${REMOTE_BYTES:-unknown}) differs from the local file (${LOCAL_BYTES})."
  exit 1
fi
echo "Upload verification successful (${REMOTE_BYTES} bytes)."

if [ "$MODE" = "predeploy" ]; then
  # A local copy makes a restore right after a bad deploy fast; the newest 5 stay.
  mkdir -p "$LOCAL_COPY_DIR"
  chmod 700 "$LOCAL_COPY_DIR"
  cp "$TEMP_FILE" "$LOCAL_COPY_DIR/$FILENAME"
  ls -1t "$LOCAL_COPY_DIR"/nexa-db-predeploy-*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm -f --
  echo "Local copy: $LOCAL_COPY_DIR/$FILENAME"
  # Pre-deploy dumps are not pruned here: the bucket's lifecycle rule for
  # database/predeploy/ does it (DATABASE_RESTORE.md).
  echo "BACKUP_KEY=$REMOTE_PATH"
  exit 0
fi

# 5. Enforce Retention Policy
echo "Enforcing retention policy (${RETENTION_DAYS} days)..."

# Calculate cutoff timestamp (compatible with Linux date)
CUTOFF_TIMESTAMP=$(date -d "${RETENTION_DAYS} days ago" +%s)

# List ONLY automatic backups using OCI CLI table format
# We use --query to fetch name and time-created, then parse the ASCII table directly in Bash
oci os object list -ns "$NAMESPACE" -bn "$BUCKET" --prefix "database/automatic/" --query "data[*].{Name:name, Time:\"time-created\"}" --output table | grep "database/automatic/" | while IFS='|' read -r col1 raw_name raw_time col4; do
  # Trim whitespace using xargs
  FILE_NAME=$(echo "$raw_name" | xargs)
  FILE_TIME_RAW=$(echo "$raw_time" | xargs)
  
  if [[ -n "$FILE_NAME" && -n "$FILE_TIME_RAW" && "$FILE_NAME" == *.sql.gz ]]; then
    # Convert OCI ISO timestamp (e.g. 2026-08-09T10:00:00.000Z) to epoch seconds
    FILE_TIMESTAMP=$(date -d "$FILE_TIME_RAW" +%s)
    
    if [ "$FILE_TIMESTAMP" -lt "$CUTOFF_TIMESTAMP" ]; then
      echo "Deleting old backup: $FILE_NAME"
      oci os object delete -ns "$NAMESPACE" -bn "$BUCKET" --name "$FILE_NAME" --force
    fi
  fi
done

echo "Backup process completed successfully at $(date)."
exit 0
