# Database Restore Procedure (Manual)

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
