#!/usr/bin/env bash
# Phase 3a inference capacity benchmark (docs/ai/architecture/INFRASTRUCTURE_DECISION.md §4).
# Approved 2026-10-19 (OD-6a, OD-19, DECISIONS.md §4); run it only in the
# approved off-hours window.
#
#   scripts/ai/benchmark/run-capacity-benchmark.sh --confirm-off-hours \
#     [--model qwen2.5:3b] [--bundles 10] [--out DIR] \
#     [--env-file /opt/nexa-chess/NexaGen/.env] [--no-stockfish]
#
# What it does, in order:
#   1. Refuses unless: --confirm-off-hours, ≥ 20 GB disk free, the live API's
#      RECORDING_STORAGE_LIMIT_GB ≤ 90 (OD-19), and LiveKit reports no room
#      with participants.
#   2. Starts a throwaway Ollama (--cpus 1.5, --memory 5g, lower CPU weight than
#      production, loopback-only port) with weights on a throwaway volume.
#   3. Scores 10 synthetic class bundles (bench.mjs), samples RSS, and measures
#      a concurrent fixed-node Stockfish search inside nexa_api.
#   4. Aborts if a class goes live (polled every 20 s).
#   5. Always removes the container AND the weights volume, even on Ctrl-C.
#
# Exit codes: 0 pass, 2 fail, 3 aborted (class went live), 1 refused/error.
set -euo pipefail

cd "$(dirname "$0")/../../.."

IMAGE=ollama/ollama:0.34.4
NAME=nexa_ai_bench_ollama
VOLUME=nexa_ai_bench_models
PORT=11435
MODEL=qwen2.5:3b
BUNDLES=10
ENV_FILE=/opt/nexa-chess/NexaGen/.env
OUT="$HOME/ai-bench/$(date -u +%Y%m%dT%H%M%SZ)"
CONFIRMED=false
STOCKFISH=true

while [ $# -gt 0 ]; do
  case "$1" in
    --confirm-off-hours) CONFIRMED=true ;;
    --model) MODEL="$2"; shift ;;
    --bundles) BUNDLES="$2"; shift ;;
    --out) OUT="$2"; shift ;;
    --env-file) ENV_FILE="$2"; shift ;;
    --no-stockfish) STOCKFISH=false ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

refuse() { echo "REFUSED: $*" >&2; exit 1; }

live_rooms() { node scripts/ai/benchmark/livekit-rooms.mjs --env-file "$ENV_FILE" 2>/dev/null || echo unknown; }

echo "Pre-flight"
$CONFIRMED || refuse "pass --confirm-off-hours (no live class may run during the benchmark)"

free_gb=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$free_gb" -ge 20 ] || refuse "only ${free_gb} GB free on /"
echo "  ok  ${free_gb} GB free"

if docker inspect nexa_api >/dev/null 2>&1; then
  cap=$(docker inspect nexa_api --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^RECORDING_STORAGE_LIMIT_GB=//p')
  cap=${cap:-130}
  awk -v c="$cap" 'BEGIN { exit !(c <= 90) }' || refuse "nexa_api RECORDING_STORAGE_LIMIT_GB is ${cap}; OD-19 needs ≤ 90 before any weights"
  echo "  ok  recording cap ${cap} GB"
else
  echo "  --  nexa_api not running here; skipping the recording-cap check"
  STOCKFISH=false
fi

rooms=$(live_rooms)
[ "$rooms" = "0" ] || refuse "LiveKit reports live rooms: ${rooms}"
echo "  ok  no live rooms"

docker container inspect "$NAME" >/dev/null 2>&1 && refuse "container $NAME already exists (a previous run?): docker rm -f $NAME; docker volume rm $VOLUME"

mkdir -p "$OUT"
RSS_FILE="$OUT/rss.log"
ABORT_FILE="$OUT/ABORTED"
SAMPLER_PID=""
WATCHER_PID=""

cleanup() {
  [ -n "$SAMPLER_PID" ] && kill "$SAMPLER_PID" 2>/dev/null || true
  [ -n "$WATCHER_PID" ] && kill "$WATCHER_PID" 2>/dev/null || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
  echo "Cleanup: container and weights volume removed. $(df -h --output=avail / | tail -1 | tr -d ' ') free."
}
trap cleanup EXIT

echo "Starting $IMAGE ($MODEL)"
docker run -d --name "$NAME" \
  --cpus 1.5 --cpu-shares 512 --memory 5g --memory-swap 5g \
  -e OLLAMA_NUM_PARALLEL=1 -e OLLAMA_MAX_LOADED_MODELS=1 \
  -p "127.0.0.1:${PORT}:11434" \
  -v "${VOLUME}:/root/.ollama" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:${PORT}/api/version" >/dev/null && break
  sleep 1
done
curl -sf "http://127.0.0.1:${PORT}/api/version" >/dev/null || { echo "Ollama did not start" >&2; docker logs "$NAME" | tail -20; exit 1; }

docker exec "$NAME" ollama pull "$MODEL"

(while true; do docker stats --no-stream --format '{{.MemUsage}}' "$NAME" >>"$RSS_FILE" 2>/dev/null; sleep 2; done) &
SAMPLER_PID=$!

(while true; do
  sleep 20
  r=$(live_rooms)
  if [ "$r" != "0" ]; then
    echo "live rooms: $r" >"$ABORT_FILE"
    echo "ABORT: LiveKit reports live rooms ($r); stopping the model" >&2
    docker stop -t 2 "$NAME" >/dev/null 2>&1 || true
    exit 0
  fi
done) &
WATCHER_PID=$!

bench_args=(--host "http://127.0.0.1:${PORT}" --model "$MODEL" --bundles "$BUNDLES" --out "$OUT" --rss-file "$RSS_FILE" --abort-file "$ABORT_FILE")
$STOCKFISH && bench_args+=(--stockfish "docker exec -i nexa_api stockfish")

set +e
node scripts/ai/benchmark/bench.mjs "${bench_args[@]}"
code=$?
set -e
[ -f "$ABORT_FILE" ] && code=3
exit $code
