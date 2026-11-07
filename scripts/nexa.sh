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
# A cold API build (prisma generate + nest build type-checks everything) needs
# ~3 GB, above Node's ~2 GB default heap on this box; it aborted with
# "JavaScript heap out of memory". A caller's own NODE_OPTIONS wins.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}"

COMMAND=$1
ENV=$2
TARGET=$3

function show_usage() {
    echo "Nexa Unified CLI"
    echo ""
    echo "Usage: nexa <command> [environment] [component]"
    echo ""
    echo "Commands:"
    echo "  start   <dev|stage|prod> [api|web]   Start environment (or one component; dev/stage)"
    echo "  stop    <dev|stage|prod> [api|web]   Stop the environment (or one component)"
    echo "  restart <dev|stage|prod> [api|web]   Restart environment (or one component)"
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

DEV_API_CMD="bash -c 'cd \"$ROOT_DIR\" && PORT=3011 npm run dev:api 2>&1 | tee api-dev.log'"
DEV_WEB_CMD="bash -c 'cd \"$ROOT_DIR\" && PORT=3010 npm run dev -w apps/web -- -p 3010 2>&1 | tee web-dev.log'"
# Staging runs SaaS isolation enforced (docs/SAAS_MULTI_TENANCY.md Phase 3); STAGE_TENANT_SCOPE_MODE=audit overrides.
# Set here, not in apps/api/.env: Prisma loads that file into unit tests too, which run without an academy.
STAGE_API_CMD="bash -c 'cd \"$ROOT_DIR\" && PORT=3011 NODE_ENV=production TENANT_SCOPE_MODE=${STAGE_TENANT_SCOPE_MODE:-enforce} node apps/api/dist/src/main.js 2>&1 | tee api-prod.log'"
# Stage builds the web without output: "standalone" (NEXT_STANDALONE=false, next.config.mjs), because
# "next start" can't serve a standalone build, and the standalone server.js ignores the Host header
# behind nginx (middleware saw 127.0.0.1/0.0.0.0, read the wrong cookies, logins bounced to /login).
STAGE_WEB_CMD="bash -c 'cd \"$ROOT_DIR\" && NEXT_STANDALONE=false PORT=3010 NODE_ENV=production npm run start -w apps/web -- -p 3010 2>&1 | tee web-prod.log'"

# Apply pending migrations to apps/api/.env's DATABASE_URL before any API launch.
# A pull that brought a new migration otherwise left the API querying columns the
# database lacks (P2022 "column ... does not exist" on every login). deploy only
# applies committed migrations; it never resets or prompts.
function migrate_db() {
    echo "=== Applying pending database migrations ==="
    (cd "$ROOT_DIR" && npm run db:migrate:deploy)
}

# (Re)launch one window, leaving the other one running.
function launch_window() {
    local name=$1 cmd=$2
    tmux kill-window -t "nexa-dev:$name" 2>/dev/null || true
    if tmux has-session -t nexa-dev 2>/dev/null; then
        tmux new-window -t nexa-dev -n "$name" "$cmd"
    else
        tmux new-session -d -s nexa-dev -n "$name" "$cmd"
    fi
}

function start_dev() {
    local target=$1
    case "$target" in
        api) migrate_db; launch_window api "$DEV_API_CMD"; echo "Dev API launched on port 3011!"; return ;;
        web) launch_window web "$DEV_WEB_CMD"; echo "Dev web launched on port 3010!"; return ;;
    esac

    echo "Stopping any existing dev/staging processes..."
    stop_session
    migrate_db

    launch_window api "$DEV_API_CMD"
    launch_window web "$DEV_WEB_CMD"

    echo "Dev servers launched in background tmux session 'nexa-dev'!"
    echo "API listening on: http://127.0.0.1:3011"
    echo "Web listening on: http://127.0.0.1:3010"
}

# Staging serves this checkout, so a restart without a pull rebuilt old code and new pushes
# never showed. Fast-forward to the branch's upstream first (never merges or rebases), and
# re-run the pulled script so a changed nexa.sh isn't half-read. NEXA_NO_PULL=1 skips it, e.g.
# to test unpushed local work.
function pull_latest() {
    [ "${NEXA_NO_PULL:-}" = "1" ] && return
    cd "$ROOT_DIR"
    local branch upstream before
    branch=$(git symbolic-ref --short -q HEAD) || { echo "Detached HEAD: not pulling."; return; }
    upstream=$(git rev-parse --abbrev-ref -q "$branch@{upstream}" 2>/dev/null) || {
        echo "Branch $branch has no upstream: not pulling, building the local code."; return; }
    echo "=== Pulling $upstream into $branch (fast-forward only) ==="
    before=$(git rev-parse HEAD)
    if ! git pull --ff-only; then
        echo ""
        echo "Error: could not fast-forward $branch to $upstream (local commits, or uncommitted"
        echo "changes to files the pull touches; see git status). Staging was NOT rebuilt."
        echo "Fix the checkout, or rerun with NEXA_NO_PULL=1 to build the local code as it is."
        exit 1
    fi
    if [ "$(git rev-parse HEAD)" != "$before" ]; then
        git --no-pager log --oneline "$before..HEAD" | head -20
        NEXA_NO_PULL=1 exec bash "$SCRIPTS_DIR/nexa.sh" "$COMMAND" "$ENV" $TARGET
    fi
}

function start_stage() {
    local target=$1
    cd "$ROOT_DIR"
    if [ "$target" = "api" ] || [ "$target" = "web" ]; then
        # Stop the old window first so the rebuild doesn't swap files under it.
        tmux kill-window -t "nexa-dev:$target" 2>/dev/null || true
        if [ "$target" = "api" ]; then
            # The shared packages first, so the API never builds against stale outputs.
            npx turbo run build --filter=@nexa-chess/api^...
            npm run build:prod -w apps/api
            migrate_db
            launch_window api "$STAGE_API_CMD"
            echo "Production-mode Dev API launched on port 3011!"
        else
            NEXT_STANDALONE=false npx turbo build --filter=@nexa-chess/web
            launch_window web "$STAGE_WEB_CMD"
            echo "Production-mode Dev web launched on port 3010!"
        fi
        return
    fi

    echo "Stopping any existing dev/staging processes..."
    stop_session

    echo "=== Building Apps in Production Mode for DEV Testing ==="
    cd "$ROOT_DIR"
    NEXT_STANDALONE=false npm run build
    migrate_db

    echo "=== Launching Production-Optimized DEV Servers on Ports 3010 / 3011 ==="
    launch_window api "$STAGE_API_CMD"
    launch_window web "$STAGE_WEB_CMD"

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
            pull_latest
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
            pull_latest
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
