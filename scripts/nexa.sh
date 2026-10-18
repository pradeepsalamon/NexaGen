#!/bin/bash
set -e

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPTS_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
ROOT_DIR="$(cd -P "$SCRIPTS_DIR/.." && pwd)"

COMMAND=$1
ENV=$2

function show_usage() {
    echo "Nexa Unified CLI"
    echo ""
    echo "Usage: nexa <command> [environment]"
    echo ""
    echo "Commands:"
    echo "  start   <dev|stage|prod>   Start the specified environment"
    echo "  stop    <dev|stage|prod>   Stop the specified environment"
    echo "  restart <dev|stage|prod>   Restart the specified environment"
    echo "  status                     Show status of all environments"
    echo "  logs [api|web]             View logs (for dev)"
    echo "  attach                     Attach to the dev tmux session"
    echo ""
    exit 1
}

function start_dev() {
    echo "Stopping any existing dev/staging processes..."
    tmux kill-session -t nexa-dev 2>/dev/null || true
    fuser -k 3010/tcp 3011/tcp 2>/dev/null || true
    sleep 1

    tmux new-session -d -s nexa-dev -n "api" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 npm run dev:api 2>&1 | tee api-dev.log'"
    tmux new-window -t nexa-dev:2 -n "web" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 npm run dev -w apps/web -- -p 3010 2>&1 | tee web-dev.log'"

    echo "Dev servers launched in background tmux session 'nexa-dev'!"
    echo "API listening on: http://127.0.0.1:3011"
    echo "Web listening on: http://127.0.0.1:3010"
}

function start_stage() {
    echo "Stopping any existing dev/staging processes..."
    tmux kill-session -t nexa-dev 2>/dev/null || true
    fuser -k 3010/tcp 3011/tcp 2>/dev/null || true
    sleep 1

    echo "=== Building Apps in Production Mode for DEV Testing ==="
    cd "$ROOT_DIR"
    npm run build

    echo "=== Launching Production-Optimized DEV Servers on Ports 3010 / 3011 ==="
    tmux new-session -d -s nexa-dev -n "api-prod" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 NODE_ENV=production node apps/api/dist/src/main.js 2>&1 | tee api-prod.log'"
    tmux new-window -t nexa-dev:2 -n "web-prod" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 NODE_ENV=production npm run start -w apps/web -- -p 3010 2>&1 | tee web-prod.log'"

    echo "Production-mode DEV servers launched in background tmux session 'nexa-dev'!"
}

function stop_dev() {
    tmux kill-session -t nexa-dev 2>/dev/null || true
    fuser -k 3010/tcp 3011/tcp 2>/dev/null || true
    echo "Stopped dev/staging servers and freed ports 3010 & 3011."
}

function status_dev() {
    echo "=== Dev Tmux Session ==="
    tmux ls 2>/dev/null | grep nexa-dev || echo "nexa-dev is not running"
    echo ""
    echo "=== Dev Services Health ==="
    WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3010/ || echo "DOWN")
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3011/auth/login -H "Content-Type: application/json" -d '{}' || echo "DOWN")

    if [ "$WEB_STATUS" = "200" ]; then
      echo "✓ Dev Web (Port 3010): UP (HTTP 200)"
    else
      echo "✗ Dev Web (Port 3010): $WEB_STATUS"
    fi

    if [ "$API_STATUS" = "400" ] || [ "$API_STATUS" = "200" ]; then
      echo "✓ Dev API (Port 3011): UP (Healthy response)"
    else
      echo "✗ Dev API (Port 3011): $API_STATUS"
    fi
}

function status_prod() {
    echo "=== Prod Services Health ==="
    WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/ || echo "DOWN")
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3001/auth/login -H "Content-Type: application/json" -d '{}' || echo "DOWN")

    if [ "$WEB_STATUS" = "200" ]; then
      echo "✓ Prod Web (Port 3000): UP (HTTP 200)"
    else
      echo "✗ Prod Web (Port 3000): $WEB_STATUS"
    fi

    if [ "$API_STATUS" = "400" ] || [ "$API_STATUS" = "200" ]; then
      echo "✓ Prod API (Port 3001): UP (Healthy response)"
    else
      echo "✗ Prod API (Port 3001): $API_STATUS"
    fi
}

if [[ -z "$COMMAND" ]]; then
    show_usage
fi

if [[ "$COMMAND" == "status" ]]; then
    status_prod
    echo ""
    status_dev
    exit 0
fi

if [[ "$COMMAND" == "logs" || "$COMMAND" == "attach" ]]; then
    if [[ "$COMMAND" == "attach" ]]; then
        tmux attach -t nexa-dev
    elif [[ "$2" == "api" ]]; then
        tmux capture-pane -pt nexa-dev:api
    elif [[ "$2" == "web" ]]; then
        tmux capture-pane -pt nexa-dev:web
    else
        echo "=== API Logs ==="
        tmux capture-pane -pt nexa-dev:api | tail -n 20
        echo ""
        echo "=== Web Logs ==="
        tmux capture-pane -pt nexa-dev:web | tail -n 20
    fi
    exit 0
fi

if [[ -z "$ENV" ]]; then
    echo "Error: Please specify an environment (dev, stage, or prod)."
    show_usage
fi

cd "$ROOT_DIR"

case "$COMMAND" in
    start)
        if [[ "$ENV" == "prod" ]]; then
            echo "Starting prod environment (Docker)..."
            docker compose up -d --build
        elif [[ "$ENV" == "stage" ]]; then
            start_stage
        elif [[ "$ENV" == "dev" ]]; then
            start_dev
        else
            echo "Unknown environment: $ENV"
            exit 1
        fi
        ;;
    stop)
        if [[ "$ENV" == "prod" ]]; then
            echo "Stopping prod environment (Docker)..."
            docker compose down
        elif [[ "$ENV" == "dev" || "$ENV" == "stage" ]]; then
            stop_dev
        else
            echo "Unknown environment: $ENV"
            exit 1
        fi
        ;;
    restart)
        if [[ "$ENV" == "prod" ]]; then
            echo "Restarting prod environment (Docker)..."
            docker compose down
            docker compose up -d --build
        elif [[ "$ENV" == "stage" ]]; then
            echo "Restarting stage environment (Tmux)..."
            stop_dev
            start_stage
        elif [[ "$ENV" == "dev" ]]; then
            echo "Restarting dev environment (Tmux)..."
            stop_dev
            start_dev
        else
            echo "Unknown environment: $ENV"
            exit 1
        fi
        ;;
    *)
        echo "Unknown command: $COMMAND"
        show_usage
        ;;
esac
