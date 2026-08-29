# NexaGen Security Boundaries

> Last updated: 2026-08-29

## Environment Separation

### Development
- **Path**: `/opt/nexa-chess/NexaGen-dev`
- **Git branch**: `dev`
- **Database**: `vps_dev`
- **Ports**: 3010 (web), 3011 (api)
- **Runtime**: Native (tmux)

### Production
- **Path**: `/opt/nexa-chess/NexaGen`
- **Git branch**: `main`
- **Database**: `nexa_chess`
- **Ports**: 3000 (web), 3001 (api)
- **Runtime**: Docker containers

## AI Worker Permissions

### ALLOWED (Development)

```
✅ Read/Write: /opt/nexa-chess/NexaGen-dev/**
✅ Read:       /opt/nexa-chess/NexaGen-dev/.env (dev config only)
✅ Database:   PostgreSQL → vps_dev
✅ Redis:      Keys with prefix nexa:dev:* or nexa:ai:*
✅ Docker:     docker logs, docker ps, docker exec (read-only queries)
✅ Git:        Branch, commit, push to dev or ai/* branches
✅ Shell:      Run tests, builds, lints in NexaGen-dev
✅ Network:    Read-only monitoring (vnstat, ss, netstat)
```

### BLOCKED (Production)

```
❌ Write:      /opt/nexa-chess/NexaGen/**
❌ Read:       /opt/nexa-chess/NexaGen/.env (production secrets)
❌ Database:   PostgreSQL → nexa_chess
❌ Docker:     docker stop/rm/restart nexa_web or nexa_api
❌ Docker:     docker compose down / docker system prune
❌ Git:        Push to main, force push, delete remote branches
❌ System:     Modify firewall, cron, systemd services
❌ System:     Install/remove system packages
❌ System:     Modify SSH config
```

### REQUIRES HUMAN APPROVAL

```
⚠️ Restart production containers
⚠️ Run Prisma migrations on nexa_chess
⚠️ Modify production .env
⚠️ Modify firewall rules (ufw)
⚠️ Delete Git branches (local or remote)
⚠️ Modify system crontab
⚠️ Install system packages (apt)
⚠️ Merge AI branches to dev
⚠️ Any operation affecting production data
```

## Secrets Policy

### Never Expose in Logs/Reports
- Database passwords
- JWT secrets
- API keys (Cloudinary, OCI, LiveKit, SMTP)
- SSH keys
- `.env` file contents

### Safe to Reference
- Port numbers
- Database names (not passwords)
- Environment variable names (not values)
- File paths
- Git commit hashes
- Container names

## Known Security Issues

1. **Shared PostgreSQL container** — dev and prod databases coexist in same container
2. **Shared Redis instance** — no key namespace isolation between environments
3. **No HTTPS** — all services exposed over plain HTTP
4. **No reverse proxy** — raw ports exposed to internet
5. **SSH brute-force** — constant login attempts from bots (no fail2ban)
6. **Wide firewall** — dev ports (3010, 3011) open to public internet
