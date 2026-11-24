# Production Docker Cheat Sheet

This file contains the most useful Docker and Docker Compose commands for managing your production environment on the Ubuntu server.
## PATH
cd /opt/nexa-chess/NexaGen

## 🚀 Deployment & Lifecycle

**Start the entire application in the background**
```bash
docker compose up -d
```

**New code: never rebuild by hand on the prod checkout**
New code goes out only through Actions → Deploy Production (lock, pre-deploy
backup, migrations, health gate, smoke test, rollback:
[DEPLOY_ROLLBACK_HARDENING.md](DEPLOY_ROLLBACK_HARDENING.md)). A hand-run
`docker compose up -d --build` skips all of that.

**Pick up a `.env` change (recreate api + web from their current images)**
```bash
scripts/nexa.sh restart prod
```

**Stop the entire application safely**
```bash
docker compose down
```

**Stop the application AND wipe all data**
*(Warning: This deletes the database and Redis volumes!)*
```bash
docker compose down -v
```

---

## 📋 Logs & Monitoring

**View real-time logs for all services combined**
```bash
docker compose logs -f
```

**View logs for a specific service**
```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f livekit
docker compose logs -f postgres
```
*(Tip: Press `Ctrl + C` to stop watching the logs)*

**Check which containers are running and their health status**
```bash
docker compose ps
```

---

## 🛠 Database & Redis Access

**Open the PostgreSQL console**
```bash
docker exec -it nexa_postgres psql -U postgres -d nexa_chess
```
*(Type `\q` to exit)*

**Open the Redis console**
```bash
docker exec -it nexa_redis redis-cli
```
*(Type `exit` to exit)*

---

## ⚙️ Prisma & Backend Operations

**Manually run database migrations**
*(A deploy applies these itself, after a pre-deploy backup and before swapping the
API; a container start never migrates (`MIGRATE_ON_START=false`). You only need
this inside a runbook in [DATABASE_RESTORE.md](DATABASE_RESTORE.md), e.g. after a
restore. Take a backup first: `scripts/backup_db.sh`.)*
```bash
docker exec -it nexa_api npx prisma migrate deploy
```

**Check migration state without applying anything**
```bash
docker exec -it nexa_api npx prisma migrate status
```

**Open a bash shell inside the API container**
```bash
docker exec -it nexa_api bash
```

---

## 🧹 Maintenance (Save Disk Space)

Over time, Docker leaves behind unused images and stopped containers which can fill up your server's hard drive.

**Clean up unused containers, networks, and images (Safe)**
```bash
docker system prune -f
```

**Deep clean (Deletes ALL unused images, including cache)**
*(Run this if your server disk is getting full)*
```bash
docker system prune -af
```

---

## 💾 Automated Database Backups

A backup script has been provided at `scripts/backup_db.sh`. It creates a gzipped SQL dump of your PostgreSQL database and automatically deletes backups older than 7 days.

The dump skips the **rows** of the Lichess puzzle catalogue (`lichess_puzzles`, ~6M re-loadable rows); the table definition and everything NexaChess-owned are included. After a restore, reload the catalogue — see [DATABASE_RESTORE.md](DATABASE_RESTORE.md) § "Lichess puzzle catalogue".

**To set it up to run automatically every night at 2:00 AM:**

1. Make the script executable:
```bash
chmod +x scripts/backup_db.sh
```

2. Open the crontab editor on your Ubuntu server:
```bash
crontab -e
```

3. Add the following line to the very bottom of the file (adjust the paths if necessary):
```bash
0 2 * * * /opt/nexa-chess/NexaGen/scripts/backup_db.sh >> /opt/nexa-chess/NexaGen/backup.log 2>&1
```

**To restore from a backup:**
```bash
# Unzip and restore directly into the docker container
gunzip -c /opt/nexa-chess/backups/db_backup_YYYY-MM-DD.sql.gz | docker exec -i nexa_postgres psql -U postgres -d nexa_chess
```
