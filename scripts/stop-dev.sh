#!/bin/bash
tmux kill-session -t nexa-dev 2>/dev/null || true
fuser -k 3010/tcp 3011/tcp 2>/dev/null || true
echo "Stopped dev/staging servers and freed ports 3010 & 3011."
