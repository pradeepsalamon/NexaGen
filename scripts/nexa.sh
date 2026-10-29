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
TARGET=$3

function show_usage() {
    echo "Nexa Unified CLI"
    echo ""
    echo "Usage: nexa <command> [environment] [component]"
    echo ""
    echo "Commands:"
    echo "  start   <dev|stage|prod> [api|web]   Start environment (component: dev/stage only)"
    echo "  stop    <dev|stage|prod> [api|web]   Stop environment (component: dev/stage only)"
    echo "  restart <dev|stage|prod> [api|web]   Restart environment (component: dev/stage only)"
    echo "  status                     Show status of all environments"
    echo "  logs [api|web]             View logs (for dev)"
    echo "  attach                     Attach to the dev tmux session"
    echo ""
    exit 1
}

# Only what this script started: killing the tmux session ends its panes'
# processes. Anything else on the ports is reported, never killed.
function stop_session() {
    if tmux has-session -t nexa-dev 2>/dev/null; then
        tmux kill-session -t nexa-dev
        sleep 1
    fi
    local port
    for port in 3010 3011; do
        if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$port" | grep -q LISTEN; then
            echo "Warning: port $port is still in use by a process this script did not start."
        fi
    done
}

# One status value: curl prints 000 itself when the request fails.
function http_status() {
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$@") || true
    [ -z "$code" ] || [ "$code" = "000" ] && code="DOWN"
    echo "$code"
}

function start_dev() {
    local target=$1
    if [ "$target" = "api" ]; then
        if tmux list-windows -t nexa-dev 2>/dev/null | grep -q ": api"; then
            tmux kill-window -t nexa-dev:api 2>/dev/null || true
        fi
        echo "=== Launching Dev API on Port 3011 ==="
        if ! tmux has-session -t nexa-dev 2>/dev/null; then
            tmux new-session -d -s nexa-dev -n "api" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 npm run dev:api 2>&1 | tee api-dev.log'"
        else
            tmux new-window -t nexa-dev -n "api" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 npm run dev:api 2>&1 | tee api-dev.log'"
        fi
        echo "Dev API launched on port 3011!"
        return
    fi
    if [ "$target" = "web" ]; then
        # Restart only the web window; the API keeps running.
        if tmux list-windows -t nexa-dev 2>/dev/null | grep -q ": web"; then
            tmux kill-window -t nexa-dev:web 2>/dev/null || true
        fi
        echo "=== Launching Dev Web on Port 3010 ==="
        if ! tmux has-session -t nexa-dev 2>/dev/null; then
            tmux new-session -d -s nexa-dev -n "web" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 npm run dev -w apps/web -- -p 3010 2>&1 | tee web-dev.log'"
        else
            tmux new-window -t nexa-dev -n "web" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 npm run dev -w apps/web -- -p 3010 2>&1 | tee web-dev.log'"
        fi
        echo "Dev web launched on port 3010!"
        return
    fi

    echo "Stopping any existing dev/staging processes..."
    stop_session

    tmux new-session -d -s nexa-dev -n "api" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 npm run dev:api 2>&1 | tee api-dev.log'"
    tmux new-window -t nexa-dev -n "web" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 npm run dev -w apps/web -- -p 3010 2>&1 | tee web-dev.log'"

    echo "Dev servers launched in background tmux session 'nexa-dev'!"
    echo "API listening on: http://127.0.0.1:3011"
    echo "Web listening on: http://127.0.0.1:3010"
}

function start_stage() {
    local target=$1
    if [ "$target" = "api" ]; then
        echo "=== Building API in Production Mode for Staging Testing ==="
        cd "$ROOT_DIR"
        # The shared packages (@nexa-chess/config, /types) first, so the API never
        # builds against missing or stale outputs.
        npx turbo run build --filter=@nexa-chess/api^...
        npm run build:prod -w apps/api
        # Only once both builds succeeded: a failed build leaves the running API up.
        if tmux list-windows -t nexa-dev 2>/dev/null | grep -q ": api"; then
            tmux kill-window -t nexa-dev:api 2>/dev/null || true
        fi

        echo "=== Launching Production-Optimized Dev API on Port 3011 ==="
        if ! tmux has-session -t nexa-dev 2>/dev/null; then
            tmux new-session -d -s nexa-dev -n "api" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 NODE_ENV=production node apps/api/dist/src/main.js 2>&1 | tee api-prod.log'"
        else
            tmux new-window -t nexa-dev -n "api" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 NODE_ENV=production node apps/api/dist/src/main.js 2>&1 | tee api-prod.log'"
        fi
        echo "Production-mode Dev API launched on port 3011!"
        return
    fi
    if [ "$target" = "web" ]; then
        # Rebuild and restart only the web window; the API keeps running.
        echo "=== Building Web in Production Mode for Staging Testing ==="
        cd "$ROOT_DIR"
        npx turbo run build --filter=@nexa-chess/web
        if tmux list-windows -t nexa-dev 2>/dev/null | grep -q ": web"; then
            tmux kill-window -t nexa-dev:web 2>/dev/null || true
        fi
        echo "=== Launching Production-Optimized Dev Web on Port 3010 ==="
        if ! tmux has-session -t nexa-dev 2>/dev/null; then
            tmux new-session -d -s nexa-dev -n "web" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 NODE_ENV=production npm run start -w apps/web -- -p 3010 2>&1 | tee web-prod.log'"
        else
            tmux new-window -t nexa-dev -n "web" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 NODE_ENV=production npm run start -w apps/web -- -p 3010 2>&1 | tee web-prod.log'"
        fi
        echo "Production-mode Dev web launched on port 3010!"
        return
    fi

    echo "Stopping any existing dev/staging processes..."
    stop_session

    echo "=== Building Apps in Production Mode for DEV Testing ==="
    cd "$ROOT_DIR"
    npm run build

    echo "=== Launching Production-Optimized DEV Servers on Ports 3010 / 3011 ==="
    tmux new-session -d -s nexa-dev -n "api" "bash -c 'cd \"$ROOT_DIR\" && PORT=3011 NODE_ENV=production node apps/api/dist/src/main.js 2>&1 | tee api-prod.log'"
    tmux new-window -t nexa-dev -n "web" "bash -c 'cd \"$ROOT_DIR\" && PORT=3010 NODE_ENV=production npm run start -w apps/web -- -p 3010 2>&1 | tee web-prod.log'"

    echo "Production-mode DEV servers launched in background tmux session 'nexa-dev'!"
}

function stop_dev() {
    stop_session
    echo "Stopped dev/staging servers."
}

function status_dev() {
    echo "=== Dev Tmux Session ==="
    tmux ls 2>/dev/null | grep nexa-dev || echo "nexa-dev is not running"
    echo ""
    echo "=== Dev Services Health ==="
    WEB_STATUS=$(http_status http://127.0.0.1:3010/)
    API_STATUS=$(http_status -X POST http://127.0.0.1:3011/auth/login -H "Content-Type: application/json" -d '{}')

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
    WEB_STATUS=$(http_status http://127.0.0.1:3000/)
    API_STATUS=$(http_status -X POST http://127.0.0.1:3001/auth/login -H "Content-Type: application/json" -d '{}')

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
        tmux capture-pane -pt nexa-dev:api 2>/dev/null | tail -n 20 || echo "(api window not running)"
        echo ""
        echo "=== Web Logs ==="
        tmux capture-pane -pt nexa-dev:web 2>/dev/null | tail -n 20 || echo "(web window not running)"
    fi
    exit 0
fi

if [[ -z "$ENV" ]]; then
    echo "Error: Please specify an environment (dev, stage, or prod)."
    show_usage
fi

cd "$ROOT_DIR"

# A mistyped component must not fall through to the whole-environment path.
if [[ -n "$TARGET" && "$TARGET" != "api" && "$TARGET" != "web" ]]; then
    echo "Unknown component: $TARGET (expected api or web)"
    exit 1
fi

# Prod is the whole Docker stack: a component target would be ignored and the
# command would take everything down, so refuse it up front.
if [[ "$ENV" == "prod" && -n "$TARGET" ]]; then
    echo "Component targets are dev/stage only. For prod use: docker compose up -d --build $TARGET"
    exit 1
fi

case "$COMMAND" in
    start)
        if [[ "$ENV" == "prod" ]]; then
            echo "Starting prod environment (Docker)..."
            docker compose up -d --build
        elif [[ "$ENV" == "stage" ]]; then
            start_stage "$TARGET"
        elif [[ "$ENV" == "dev" ]]; then
            start_dev "$TARGET"
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
            if [ "$TARGET" = "web" ] && tmux list-windows -t nexa-dev 2>/dev/null | grep -q ": web"; then
                tmux kill-window -t nexa-dev:web
                echo "Stopped dev web window."
            elif [ "$TARGET" = "api" ] && tmux list-windows -t nexa-dev 2>/dev/null | grep -q ": api"; then
                tmux kill-window -t nexa-dev:api
                echo "Stopped dev api window."
            elif [ -n "$TARGET" ]; then
                # Only that component was asked for; never stop the rest.
                echo "Dev $TARGET is not running."
            else
                stop_dev
            fi
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
            start_stage "$TARGET"
        elif [[ "$ENV" == "dev" ]]; then
            echo "Restarting dev environment (Tmux)..."
            start_dev "$TARGET"
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
