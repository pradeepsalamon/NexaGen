#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Building Apps in Production Mode for DEV Testing ==="

# Build API & Web
npm run build

# Kill existing dev session if running
tmux kill-session -t nexa-dev 2>/dev/null || true

echo "=== Launching Production-Optimized DEV Servers on Ports 3010 / 3011 ==="

# Window 1: API in Production Mode (Port 3011, vps_dev DB)
tmux new-session -d -s nexa-dev -n "api-prod" "bash -c 'cd $DIR && PORT=3011 NODE_ENV=production node apps/api/dist/src/main.js 2>&1 | tee api-prod.log'"

# Window 2: Next.js Web in Production Server Mode (Port 3010)
tmux new-window -t nexa-dev:2 -n "web-prod" "bash -c 'cd $DIR && PORT=3010 NODE_ENV=production npm run start -w apps/web -- -p 3010 2>&1 | tee web-prod.log'"

echo "Production-mode DEV servers launched in background tmux session 'nexa-dev'!"
echo "API (Prod Mode): http://127.0.0.1:3011 (or http://146.56.55.170:3011)"
echo "Web (Prod Mode): http://127.0.0.1:3010 (or http://146.56.55.170:3010)"
echo "Check status:    ./scripts/status-dev.sh"
echo "Stop servers:    ./scripts/stop-dev.sh"
