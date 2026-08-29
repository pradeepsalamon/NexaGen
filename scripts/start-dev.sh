#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Kill existing nexa-dev tmux session if running
tmux kill-session -t nexa-dev 2>/dev/null || true

# Window 1: Dev API (Port 3011)
tmux new-session -d -s nexa-dev -n "api" "bash -c 'cd $DIR && PORT=3011 npm run dev:api 2>&1 | tee api-dev.log'"

# Window 2: Dev Web (Port 3010)
tmux new-window -t nexa-dev:2 -n "web" "bash -c 'cd $DIR && PORT=3010 npm run dev -w apps/web -- -p 3010 2>&1 | tee web-dev.log'"

echo "Dev servers launched in background tmux session 'nexa-dev'!"
echo "API listening on: http://127.0.0.1:3011"
echo "Web listening on: http://127.0.0.1:3010"
