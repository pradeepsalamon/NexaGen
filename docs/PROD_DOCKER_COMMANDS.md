# Production Docker Cheat Sheet

This file contains the most useful Docker and Docker Compose commands for managing your production environment on the Ubuntu server.
## PATH
cd /opt/nexa-chess/NexaGen

## 🚀 Deployment & Lifecycle

**Start the entire application in the background**
```bash
docker compose up -d
```

**Rebuild and deploy after pulling new code**
*(This rebuilds the images without caching, applies changes, and restarts only the containers that changed)*
```bash
docker compose up -d --build
```

**Rebuild and deploy ONLY a specific app after pulling new code (Fastest)**
*(Replace `api` with `web`, `livekit`, or whatever container changed)*
```bash
docker compose up -d --build api
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
*(Usually `entrypoint.sh` does this automatically, but if you ever need to run it manually)*
```bash
docker exec -it nexa_api npx prisma migrate deploy
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
