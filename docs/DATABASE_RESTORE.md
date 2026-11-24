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

## 7. A failed migration

The deploy stopped at "DEPLOYMENT ABORTED: migrations failed". The previous API
is still serving, and restarting it is safe: a container start never migrates
(`MIGRATE_ON_START=false`). The next deploy refuses until this is cleared
("the database has a failed migration"). A pre-deploy backup was taken just
before; its key is in `.deploy/history.log` (`backup ok … backup=<key>`).

1. See what failed and why:
   ```bash
   docker exec -i nexa_postgres psql -U postgres -d nexa_chess -c \
     "select migration_name, started_at, logs from _prisma_migrations where finished_at is null and rolled_back_at is null;"
   ```
2. Check whether any of it applied. Postgres runs a migration file as one
   implicit transaction, so usually nothing did. Look for the tables, columns
   or types the file creates (`\d <table>` in psql).
3. **Nothing applied** (the usual case): mark it rolled back. This is what
   `prisma migrate resolve --rolled-back <name>` writes; the prod checkout no
   longer has the file after the abort, so do it in SQL:
   ```bash
   docker exec -i nexa_postgres psql -U postgres -d nexa_chess -c \
     "update _prisma_migrations set rolled_back_at = now() where migration_name = '<name>' and finished_at is null;"
   ```
   Then fix the migration in a PR into `main` (it never applied in
   production, so the file itself may be corrected; say so in the PR) and
   deploy again.
4. **Part of it applied**: either finish it by hand and mark it applied
   (`finished_at = now()`, an owner's call), or restore the pre-deploy backup
   (§8). Never mark it applied while its changes are only partly there.

## 8. Restore after a bad deploy

Use this when a deploy damaged data, or a class C migration is live and a fix
can't be rolled forward in time (docs/DEPLOY_ROLLBACK_HARDENING.md §4). Every
write since the backup is lost, so the owner decides, knowing the window
(the backup's UTC time is in its name).

1. Maintenance page on: `scripts/nexa.sh maintenance on prod`.
2. Keep what is there now, so nothing is lost for good: `scripts/backup_db.sh`.
3. Find the pre-deploy dump: the newest `backup=` in `.deploy/history.log`.
   Only the newest one is kept: a local copy in `.deploy/backups/` and one in
   OCI `database/predeploy/` (§1). An older point in time means a nightly
   backup (`database/automatic/`, 14 days).
4. Stop the app: `docker compose stop api web`.
5. Recreate the database. Restoring over the top would keep the newer schema,
   so drop it first:
   ```bash
   docker exec -i nexa_postgres psql -U postgres -d postgres \
     -c 'DROP DATABASE nexa_chess WITH (FORCE);' -c 'CREATE DATABASE nexa_chess;'
   gunzip -c .deploy/backups/<file>.sql.gz | docker exec -i nexa_postgres psql -v ON_ERROR_STOP=1 -U postgres -d nexa_chess
   ```
6. Put back the code that matches the restored schema:
   - **The deploy failed and was not rolled back** ("NOT ROLLED BACK"):
     ```bash
     git checkout -f "$(cat .deploy/last-good-commit)"
     for s in api web; do docker tag "nexagen-$s:last-good" "nexagen-$s:latest"; done
     docker compose up -d --no-build api web
     ```
     (`docker images | grep last-good` shows the image names if the compose
     project isn't `nexagen`.)
   - **The deploy succeeded and misbehaved later**: Actions → Deploy Production
     → Run workflow → `action: rollback`. Its schema check passes now that the
     database is back to the older migrations.
7. Reload the Lichess catalogue (§6), check §5, maintenance page off.
8. Record it: `echo "$(date -u +%FT%TZ) restore <file> (reason)" >> .deploy/history.log`.

Only the newest pre-deploy backup is kept, locally and in OCI: each new one,
once verified, removes the older ones. So restore from it before the next
deploy that migrates, or copy it somewhere first.
