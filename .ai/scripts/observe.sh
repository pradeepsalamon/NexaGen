#!/bin/bash
# ============================================================
# Nexa AI — VPS Observability Script
# ============================================================
# Quick health check of the entire VPS and all services.
# Usage: .ai/scripts/observe.sh
# ============================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "============================================"
echo "  Nexa VPS Health Report"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# 1. System Resources
echo "── System Resources ──"
echo "  CPU Cores: $(nproc)"
echo "  Load:      $(uptime | awk -F'load average:' '{print $2}')"
echo "  RAM:       $(free -h | awk '/Mem:/ {printf "%s used / %s total (%s available)", $3, $2, $7}')"
echo "  Disk:      $(df -h / | awk 'NR==2 {printf "%s used / %s total (%s)", $3, $2, $5}')"
echo "  Uptime:    $(uptime -p)"
echo ""

# 2. Docker Containers
echo "── Docker Containers ──"
docker ps --format "  {{.Names}}: {{.Status}}" 2>/dev/null || echo "  Docker not available"
echo ""

# 3. Service Health
echo "── Service Health ──"

# Production Web
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || echo "DOWN")
if [ "$WEB_STATUS" = "200" ]; then
  echo "  ✅ Prod Web  (3000): UP"
else
  echo "  ❌ Prod Web  (3000): $WEB_STATUS"
fi

# Production API
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3001/auth/login -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "DOWN")
if [ "$API_STATUS" = "400" ] || [ "$API_STATUS" = "200" ]; then
  echo "  ✅ Prod API  (3001): UP"
else
  echo "  ❌ Prod API  (3001): $API_STATUS"
fi

# Dev Web
DEV_WEB=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3010/ 2>/dev/null || echo "DOWN")
if [ "$DEV_WEB" = "200" ]; then
  echo "  ✅ Dev Web   (3010): UP"
else
  echo "  ❌ Dev Web   (3010): $DEV_WEB"
fi

# Dev API
DEV_API=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3011/auth/login -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "DOWN")
if [ "$DEV_API" = "400" ] || [ "$DEV_API" = "200" ]; then
  echo "  ✅ Dev API   (3011): UP"
else
  echo "  ❌ Dev API   (3011): $DEV_API"
fi

# PostgreSQL
PG_STATUS=$(docker exec nexa_postgres pg_isready -U postgres 2>&1 | grep -q "accepting" && echo "UP" || echo "DOWN")
echo "  $([ "$PG_STATUS" = "UP" ] && echo "✅" || echo "❌") PostgreSQL (5432): $PG_STATUS"

# Redis
REDIS_STATUS=$(docker exec nexa_redis redis-cli ping 2>/dev/null || echo "DOWN")
echo "  $([ "$REDIS_STATUS" = "PONG" ] && echo "✅" || echo "❌") Redis     (6379): $REDIS_STATUS"

# LiveKit
LK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7880/ 2>/dev/null || echo "DOWN")
echo "  $([ "$LK_STATUS" != "DOWN" ] && echo "✅" || echo "❌") LiveKit   (7880): $LK_STATUS"

echo ""

# 4. Docker Resource Usage
echo "── Container Resources ──"
docker stats --no-stream --format "  {{.Name}}: CPU {{.CPUPerc}} | MEM {{.MemUsage}}" 2>/dev/null || echo "  Docker stats unavailable"
echo ""

# 5. Git Status
echo "── Git Status (dev) ──"
cd "$DIR" 2>/dev/null
echo "  Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo "  Dirty files: $(git status --short 2>/dev/null | wc -l)"
echo "  Last commit: $(git log -1 --oneline 2>/dev/null || echo 'unknown')"
echo ""

# 6. Network
echo "── Network (Today) ──"
vnstat -d 2>/dev/null | grep "today" || echo "  vnstat not available"
echo ""

# 7. Tmux Sessions
echo "── Tmux Sessions ──"
tmux ls 2>/dev/null || echo "  No tmux sessions"
echo ""

echo "============================================"
echo "  Report Complete"
echo "============================================"
