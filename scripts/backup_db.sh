#!/bin/bash
set -euo pipefail

# ==============================================================================
# Nexa Database Backup Script (OCI Object Storage)
# ==============================================================================
# This script performs a pg_dump of the production database running in Docker,
# compresses it, and uploads it to an Oracle Cloud (OCI) Object Storage bucket
# using the S3 compatibility API. It also handles a 14-day retention policy.
# ==============================================================================

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

export AWS_ACCESS_KEY_ID="$OCI_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$OCI_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="$REGION"

DATE=$(date +%Y-%m-%d-%H-%M-%S)
FILENAME="nexa-db-${DATE}.sql.gz"
TEMP_FILE="/tmp/${FILENAME}"
REMOTE_PATH="database/automatic/${FILENAME}"

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
echo "Dumping and compressing database '$DB_NAME'..."
docker exec -i "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$TEMP_FILE"

# Verify file was created and is not empty
if [ ! -s "$TEMP_FILE" ]; then
  echo "Error: Backup file is empty or failed to create."
  exit 1
fi
echo "Backup created locally: $TEMP_FILE ($(du -h "$TEMP_FILE" | cut -f1))"

# 3. Upload to OCI Object Storage
echo "Uploading backup to OCI Object Storage (Buffer mode to bypass aws-chunked)..."
node "$SCRIPT_DIR/upload_to_oci.js" "$TEMP_FILE" "$BUCKET" "$REMOTE_PATH" "$ENDPOINT" "$REGION"

# 4. Verify Upload via Head-Object
echo "Verifying uploaded object exists in OCI..."
if ! aws s3api head-object --bucket "$BUCKET" --key "$REMOTE_PATH" --endpoint-url "$ENDPOINT" >/dev/null 2>&1; then
  echo "Error: Verification failed. The object '$REMOTE_PATH' was not found in OCI."
  exit 1
fi
echo "Upload verification successful."

# 5. Enforce Retention Policy
echo "Enforcing retention policy (${RETENTION_DAYS} days)..."

# Calculate cutoff timestamp (compatible with Linux date)
CUTOFF_TIMESTAMP=$(date -d "${RETENTION_DAYS} days ago" +%s)

# List ONLY automatic backups
aws s3 ls "s3://${BUCKET}/database/automatic/" --endpoint-url "$ENDPOINT" | while read -r line; do
  FILE_DATE=$(echo "$line" | awk '{print $1}')
  FILE_TIME=$(echo "$line" | awk '{print $2}')
  FILE_NAME=$(echo "$line" | awk '{print $4}')
  
  if [[ -n "$FILE_DATE" && -n "$FILE_TIME" && -n "$FILE_NAME" && "$FILE_NAME" == *.sql.gz ]]; then
    FILE_TIMESTAMP=$(date -d "$FILE_DATE $FILE_TIME" +%s)
    
    if [ "$FILE_TIMESTAMP" -lt "$CUTOFF_TIMESTAMP" ]; then
      echo "Deleting old backup: $FILE_NAME"
      aws s3 rm "s3://${BUCKET}/database/automatic/${FILE_NAME}" --endpoint-url "$ENDPOINT"
    fi
  fi
done

echo "Backup process completed successfully at $(date)."
exit 0
