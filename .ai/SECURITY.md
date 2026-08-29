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

## AI Worker Permissions (Phase 9 Human Approval & Risk Engine)

> **AUTHORITATIVE TRANSPORT RULE**:
> **Redis is NOT used for AI task orchestration. Filesystem task contracts remain authoritative.**
> Shared Redis is used exclusively for application caching with strict dev prefix filtering (`nexa:dev:*`, `nexa:ai:*`).

### ALLOWED (Development & Isolated Worktrees)

```
✅ Planning:   npm run ai:manager -- "<request>" (outputs structured plan & risk)
✅ Worktrees:  Execute inside /opt/nexa-chess/NexaGen-dev/.worktrees/<worker_id>
✅ Read/Write: /opt/nexa-chess/NexaGen-dev/** (inside assigned worktree)
✅ Read:       /opt/nexa-chess/NexaGen-dev/.env (dev config only)
✅ Database:   PostgreSQL → vps_dev ONLY
✅ Redis:      Keys with prefix nexa:dev:* or nexa:ai:* (application caching only)
✅ LiveKit:    Test rooms named dev-ai-<task-id>-<purpose>
✅ Docker:     docker logs, docker ps, docker exec (read-only diagnostics)
✅ Git:        Create task branch (ai/NEXA-XXXX-*), commit to task branch inside worktree
✅ Shell:      Run tests, builds, lints inside assigned worker worktree
✅ Review:     Generate .ai/reviews/NEXA-XXXX.md and read-only merge check
```

### BLOCKED (Production & System)

```
❌ Shared Root:Direct worker code modification in shared root repository
❌ Write:      /opt/nexa-chess/NexaGen/**
❌ Read:       /opt/nexa-chess/NexaGen/.env (production secrets)
❌ Database:   PostgreSQL → nexa_chess or postgres
❌ Redis:      FLUSHALL, FLUSHDB, unscoped prod keys, task queue brokers
❌ LiveKit:    Mutating production rooms
❌ Docker:     docker stop/rm/restart nexa_web, nexa_api, or compose down
❌ Git:        Auto-merging to dev/main, auto-pushing to dev/main, force push, branch deletion
❌ System:     sudo, apt install, ufw delete, iptables -F, useradd, passwd
❌ Filesystem: Path traversal (../NexaGen, /etc, symlink escape)
```

### REQUIRES HUMAN APPROVAL

```
⚠️ Executing planned tasks (npm run ai:manager -- --approve <TASK_ID>)
⚠️ Approving multi-task DAG plans (npm run ai:manager -- --approve-plan <TASK_ID>)
⚠️ High-risk database migrations or auth modifications
⚠️ Merging AI task branch (ai/NEXA-XXXX-*) into dev
⚠️ Merging dev into main
⚠️ Deploying to production
⚠️ Restarting production containers
⚠️ Running Prisma migrations on nexa_chess
⚠️ Modifying production .env
⚠️ Modifying firewall rules (ufw)
⚠️ Installing system packages (apt)
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
