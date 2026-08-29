# NexaGen VPS Infrastructure

> Last updated: 2026-08-29

## Server Specifications

| Property | Value |
|:---|:---|
| Provider | Oracle Cloud Infrastructure (OCI) |
| OS | Ubuntu 24.04.4 LTS (Noble Numbat) |
| Architecture | ARM64 (aarch64) — Ampere Neoverse-N1 |
| CPU | 2 cores |
| RAM | 12 GB |
| Disk | 200 GB SSD (14% used) |
| Public IP | 146.56.55.170 |
| Private IP | 10.0.0.170 |
| Kernel | 6.17.0-1019-oracle |
| Hostname | nexa-vcn |

## Port Allocation

| Port | Protocol | Service | Environment | Access |
|:---|:---|:---|:---|:---|
| 22 | TCP | SSH (OpenSSH) | System | Public |
| 80 | TCP | HTTP (reserved) | Future | Public |
| 443 | TCP | HTTPS (reserved) | Future | Public |
| 3000 | TCP | Next.js (Docker) | Production | Public |
| 3001 | TCP | NestJS API (Docker) | Production | Public |
| 3010 | TCP | Next.js (tmux) | Development | Public |
| 3011 | TCP | NestJS API (tmux) | Development | Public |
| 5432 | TCP | PostgreSQL | Shared | Localhost only |
| 6379 | TCP | Redis | Shared | Docker internal |
| 7880 | TCP | LiveKit HTTP/WS | Shared | Public |
| 7881 | TCP | LiveKit TCP fallback | Shared | Public |
| 50000-50010 | UDP | LiveKit WebRTC | Shared | Public |

## Docker Stack

### Containers

| Name | Image | Status | Ports |
|:---|:---|:---|:---|
| nexa_web | nexagen-web (custom) | Healthy | 3000 |
| nexa_api | nexagen-api (custom) | Healthy | 3001 |
| nexa_livekit | livekit/livekit-server:latest | Running | 7880, 7881, 50000-50010/udp |
| nexa_postgres | postgres:15-alpine | Healthy | 127.0.0.1:5432 |
| nexa_redis | redis:7-alpine | Healthy | 6379 (internal) |

### Network
- Bridge network: `nexagen_nexa_network`

### Volumes
- `nexagen_postgres_data` — PostgreSQL data
- `nexagen_redis_data` — Redis persistence

## Databases

| Database | Purpose | Size |
|:---|:---|:---|
| nexa_chess | Production | ~10 MB |
| vps_dev | Development | ~10 MB |
| postgres | System default | ~7 MB |

**⚠ WARNING**: Both databases are in the same PostgreSQL container. No container-level isolation.

## Firewall (UFW)

Default policy: deny incoming, allow outgoing.

Open ports: 22, 80, 443, 3000, 3001, 3010, 3011, 7880, 7881, 50000-60000/udp

## Installed Tools

| Tool | Path | Version |
|:---|:---|:---|
| Node.js | /usr/bin/node | v20.20.2 |
| npm | /usr/bin/npm | 10.8.2 |
| Docker | /usr/bin/docker | 29.7.2 |
| Docker Compose | plugin | v5.4.0 |
| Git | /usr/bin/git | system |
| tmux | /usr/bin/tmux | system |
| Stockfish | /usr/games/stockfish | 16 |
| code-server | /usr/bin/code-server | system |
| OpenCode AI | global npm | 1.18.21 |
| curl, wget | /usr/bin/ | system |
| vnstat | system | bandwidth monitor |
| iftop | system | traffic monitor |
| nethogs | system | per-process traffic |

## Cron Jobs

```cron
# Daily database backup at 20:00 UTC
0 20 * * * /opt/nexa-chess/NexaGen/scripts/backup_db.sh >> /opt/nexa-chess/NexaGen/backup.log 2>&1
```

**⚠ WARNING**: Backup is currently failing — `oci` CLI not in cron PATH.

## Monitoring Commands

```bash
# Quick health check
./scripts/status-dev.sh                    # Dev services
docker ps --format "table {{.Names}}\t{{.Status}}"  # All containers

# Resource usage
free -h                                     # RAM
df -h /                                     # Disk
nproc && uptime                             # CPU / load
docker stats --no-stream                    # Container resources

# Network
vnstat                                      # Bandwidth summary
vnstat -h                                   # Hourly breakdown
ss -tlnp                                    # Listening ports
sudo nethogs enp0s6                         # Per-process traffic

# Logs
docker logs nexa_api --tail 50              # Prod API logs
docker logs nexa_web --tail 50              # Prod Web logs
tmux capture-pane -pt nexa-dev:0            # Dev API logs
tmux capture-pane -pt nexa-dev:2            # Dev Web logs
tail -f api-dev.log                         # Dev API log file
tail -f web-dev.log                         # Dev Web log file

# Database
docker exec nexa_postgres psql -U postgres -d vps_dev -c "SELECT count(*) FROM \"User\";"
docker exec nexa_redis redis-cli INFO keyspace
```
