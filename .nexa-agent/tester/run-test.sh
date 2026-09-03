#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/nexa-chess/NexaGen-dev"

cd "$ROOT"

echo "NexaChess OpenCode Tester"
echo "Workspace: $ROOT"
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git rev-parse --short HEAD)"
echo

if [ "$ROOT" != "/opt/nexa-chess/NexaGen-dev" ]; then
    echo "SAFETY ERROR: invalid workspace"
    exit 1
fi

if [ -d "/opt/nexa-chess/NexaGen" ]; then
    echo "Production directory detected but will NOT be accessed."
fi

echo "Tester configuration ready."
