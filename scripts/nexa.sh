#!/bin/bash
set -e

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPTS_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

case "$1" in
  start-dev|dev)
    "$SCRIPTS_DIR/start-dev.sh"
    ;;
  start-stage|stage)
    "$SCRIPTS_DIR/start-stage.sh"
    ;;
  status-dev|status)
    "$SCRIPTS_DIR/status-dev.sh"
    ;;
  stop-dev|stop)
    "$SCRIPTS_DIR/stop-dev.sh"
    ;;
  restart-dev|restart)
    "$SCRIPTS_DIR/stop-dev.sh"
    "$SCRIPTS_DIR/start-dev.sh"
    ;;
  logs)
    if [ "$2" = "api" ]; then
      tmux capture-pane -pt nexa-dev:api
    elif [ "$2" = "web" ]; then
      tmux capture-pane -pt nexa-dev:web
    else
      echo "=== API Logs ==="
      tmux capture-pane -pt nexa-dev:api | tail -n 20
      echo ""
      echo "=== Web Logs ==="
      tmux capture-pane -pt nexa-dev:web | tail -n 20
    fi
    ;;
  attach)
    tmux attach -t nexa-dev
    ;;
  *)
    echo "Nexa Chess Development CLI"
    echo ""
    echo "Usage: nexa <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start-dev, dev         Start dev servers in watch/hot-reload mode (3010 Web, 3011 API)"
    echo "  start-stage, stage     Build & start production-mode dev servers (3010 Web, 3011 API)"
    echo "  status-dev, status     Check status and health of dev servers"
    echo "  stop-dev, stop         Stop dev servers (kills nexa-dev tmux session)"
    echo "  restart-dev, restart   Restart dev servers"
    echo "  logs [api|web]         View recent logs of dev services"
    echo "  attach                 Attach to the interactive nexa-dev tmux session"
    echo ""
    echo "Direct individual commands available anywhere in your terminal:"
    echo "  start-dev, start-stage, status-dev, stop-dev"
    ;;
esac
