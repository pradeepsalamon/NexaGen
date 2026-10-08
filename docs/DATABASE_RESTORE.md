# Database Restore Procedure (Manual)

Restores are deliberately CLI-only: the admin web UI can list, download and trigger
backups but has no restore button, so a stolen admin session cannot wipe production.

This document outlines the procedure for manually restoring the production database from an Oracle Cloud Infrastructure (OCI) Object Storage backup.

> [!WARNING]
> **Downtime Required**
> Restoring a database overwrites existing data. You should stop the application (`nexa_api`, `nexa_web`) before performing a full restore to avoid data corruption from active users during the restore process.

## 1. Locate and Download the Backup
1. Go to your Nexa Admin Dashboard (`/admin`).
2. Scroll down to the **Database Backups** section.
3. Find the backup you want to restore and click the **Download** button.
   - The file will be named something like `nexa-db-2026-08-09-02-00-00.sql.gz`.
4. Upload this file to your Ubuntu VPS (e.g., using `scp` or `sftp`).

*(Alternatively, you can download it directly on the VPS using the AWS CLI configured for OCI)*:
```bash
aws s3 cp s3://nexa-db-backups/database/automatic/nexa-db-2026-08-09-02-00-00.sql.gz ./ --endpoint-url https://YOUR_NAMESPACE.compat.objectstorage.YOUR_REGION.oci.customer-oci.com
```

## 2. Prepare the Environment
Stop the application containers to prevent new data from being written while you restore:
```bash
cd /opt/nexa-chess/NexaGen
docker compose stop api web
```

Ensure the database container (`nexa_postgres`) is still running!
```bash
docker ps | grep nexa_postgres
```

## 3. Execute the Restore
Because our backups are generated as plain SQL and compressed with `gzip`, we do not need to use `pg_restore`. We can simply decompress the stream and pipe it directly into the PostgreSQL container using `psql`.

Run this command, replacing `nexa-db-2026-08-09-02-00-00.sql.gz` with your actual filename:

```bash
gunzip -c nexa-db-2026-08-09-02-00-00.sql.gz | docker exec -i nexa_postgres psql -U postgres -d nexa_chess
```

*Note: You may see several "already exists" warnings during the restore if you are restoring over an existing database without dropping it first. For a completely clean slate, you can drop and recreate the `nexa_chess` database via `docker exec -it nexa_postgres psql -U postgres` before running the command above.*

## 4. Restart the Application
Once the restore completes without fatal errors, restart your application:
```bash
docker compose start api web
```

## 5. Verification
1. Open the Nexa web application.
2. Log in as an administrator.
3. Check the Users and Classes pages to ensure the data matches the expected state from the time of the backup.

## 6. Lichess puzzle catalogue

Every backup — the nightly `scripts/backup_db.sh` and the admin "Backup now"
button — skips the **rows** of `lichess_puzzles`
(and its transient `lichess_puzzles_staging`). The table definitions are
dumped; only the ~6M rows of re-loadable source data are not. Everything
NexaChess-owned is backed up as before, including every `puzzles` row copied
from the catalogue, all attempts, ratings and progress, and the small
`lichess_catalogue_releases` table. No backed-up row references the catalogue
by foreign key, so a restore never loses student history.

After a restore the catalogue is therefore **empty**. Until it is reloaded the
catalogue tab shows no results and student training (if enabled) falls back to
review / 404; every existing puzzle, course and class works normally.

To reload it:

1. Ask the restored database which release it had loaded:
   ```bash
   docker exec -i nexa_postgres psql -U postgres -d nexa_chess -tA -c \
     'SELECT id FROM lichess_catalogue_releases WHERE "loadCompletedAt" IS NOT NULL ORDER BY "loadCompletedAt" DESC LIMIT 1'
   ```
   No row means the catalogue was never loaded — there is nothing to do.
2. That id is the prepared artifact's `preparedSha256`. Its files live,
   write-once, in the backup bucket at `lichess/<id>/catalogue.tsv.zst` and
   `lichess/<id>/manifest.json`. Fetch both.
3. Run `scripts/lichess-puzzles-load.sh <manifest>` (about 15–30 min; it pauses
   on its own while a live class is running or the host is loaded). It does not
   need Lichess to be reachable.

Spec: [PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md](PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md) §13–§14.
