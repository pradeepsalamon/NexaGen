#!/usr/bin/env bash
#
# Start the control UI detached from whatever shell launched it.
#
# Running `npm run dev` straight from an interactive shell ties the server's
# lifetime to that terminal -- close it (or have the agent session that started
# it end) and the UI dies with it. setsid puts it in its own session so it
# survives. For a server that should come back after a reboot, use a systemd
# unit instead; this is the "keep it up until the box restarts" version.
#
#   scripts/start-control-ui.sh          start it
#   scripts/start-control-ui.sh --stop   stop it
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="$AGENT_DIR/control/ui"
LOG="$AGENT_DIR/logs/control-ui.log"
PID_FILE="$AGENT_DIR/logs/control-ui.pid"
PORT=8080

running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

if [ "${1:-}" = "--stop" ]; then
  if running; then
    kill "$(cat "$PID_FILE")"
    rm -f "$PID_FILE"
    echo "stopped"
  else
    echo "not running"
  fi
  exit 0
fi

if running; then
  echo "already running (pid $(cat "$PID_FILE")) on :$PORT"
  exit 0
fi

mkdir -p "$AGENT_DIR/logs"
cd "$UI_DIR"

setsid npm run dev >>"$LOG" 2>&1 < /dev/null &
echo $! > "$PID_FILE"
disown || true

for _ in $(seq 1 45); do
  if curl -sf -o /dev/null "http://localhost:$PORT"; then
    echo "control UI up on :$PORT (pid $(cat "$PID_FILE"))"
    echo "log: $LOG"
    exit 0
  fi
  sleep 1
done

echo "did not come up within 45s -- see $LOG" >&2
exit 1
