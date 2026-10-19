#!/usr/bin/env bash
# Speech timing test for live captions (docs/ai/architecture/LIVE_CAPTIONS.md §5).
# Same rules as run-capacity-benchmark.sh: off-hours, no live class, throwaway
# container, everything removed afterwards. No class audio is used.
#
#   scripts/ai/benchmark/run-speech-benchmark.sh --confirm-off-hours \
#     [--models base.en,small.en,distil-small.en] [--clips 40] [--smoke] \
#     [--hf-token-file FILE] [--out DIR] [--env-file /opt/nexa-chess/NexaGen/.env]
#
# What it does, in order:
#   1. Refuses unless: --confirm-off-hours, ≥ 20 GB disk free, the live API's
#      RECORDING_STORAGE_LIMIT_GB ≤ 90 (OD-19), and LiveKit reports no room
#      with participants.
#   2. Starts a throwaway python:3.12-slim container (--cpus 1.5, --memory 5g,
#      lower CPU weight than production, no ports) and installs the pinned
#      speech/requirements.txt into it.
#   3. Runs speech/speech_bench.py: LibriSpeech test-clean + a synthetic chess
#      script through faster-whisper, and a translator (IndicTrans2 with
#      --hf-token-file, since the model is gated; otherwise opus-mt-en-hi as a
#      latency proxy).
#   4. Aborts if a class goes live (polled every 20 s).
#   5. Always removes the container, the data/weights volume and the Python
#      image (unless it was already on the box), even on Ctrl-C.
#
# Exit codes: 0 a model passes, 2 none does, 3 aborted (class went live), 1 refused/error.
set -euo pipefail

cd "$(dirname "$0")/../../.."

IMAGE=python:3.12-slim-bookworm
NAME=nexa_ai_bench_speech
VOLUME=nexa_ai_bench_speech_work
CPUS=1.5
MEMORY=5g
ENV_FILE=/opt/nexa-chess/NexaGen/.env
OUT="$HOME/ai-bench/speech-$(date -u +%Y%m%dT%H%M%SZ)"
CONFIRMED=false
HF_TOKEN_FILE=""
bench_args=()

while [ $# -gt 0 ]; do
  case "$1" in
    --confirm-off-hours) CONFIRMED=true ;;
    --models|--clips) bench_args+=("$1" "$2"); shift ;;
    --smoke) bench_args+=(--smoke) ;;
    --hf-token-file) HF_TOKEN_FILE="$(realpath "$2")"; shift ;;
    --out) OUT="$2"; shift ;;
    --env-file) ENV_FILE="$2"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

refuse() { echo "REFUSED: $*" >&2; exit 1; }

live_rooms() { node scripts/ai/benchmark/livekit-rooms.mjs --env-file "$ENV_FILE" 2>/dev/null || echo unknown; }

echo "Pre-flight"
$CONFIRMED || refuse "pass --confirm-off-hours (no live class may run during the benchmark)"
[ -z "$HF_TOKEN_FILE" ] || [ -r "$HF_TOKEN_FILE" ] || refuse "cannot read $HF_TOKEN_FILE"

python3 -I scripts/ai/benchmark/speech/speech_bench.py --self-test >/dev/null || refuse "scorer self-test failed"
echo "  ok  scorer self-test"

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
fi

rooms=$(live_rooms)
[ "$rooms" = "0" ] || refuse "LiveKit reports live rooms: ${rooms}"
echo "  ok  no live rooms"

docker container inspect "$NAME" >/dev/null 2>&1 && refuse "container $NAME already exists (a previous run?): docker rm -f $NAME; docker volume rm $VOLUME"

KEEP_IMAGE=false
docker image inspect "$IMAGE" >/dev/null 2>&1 && KEEP_IMAGE=true

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
  $KEEP_IMAGE || docker image rm "$IMAGE" >/dev/null 2>&1 || true
  echo "Cleanup: container, data volume and image removed. $(df -h --output=avail / | tail -1 | tr -d ' ') free."
}
trap cleanup EXIT

run_args=(-d --name "$NAME" --cpus "$CPUS" --cpu-shares 512 --memory "$MEMORY" --memory-swap "$MEMORY"
  -v "$PWD/scripts/ai/benchmark/speech:/bench:ro" -v "$OUT:/out" -v "${VOLUME}:/work"
  -e PIP_DISABLE_PIP_VERSION_CHECK=1 -e PIP_NO_CACHE_DIR=1 -e HF_HOME=/work/hf -e HF_HUB_DISABLE_TELEMETRY=1)
[ -n "$HF_TOKEN_FILE" ] && run_args+=(-v "$HF_TOKEN_FILE:/run/secrets/hf_token:ro")

echo "Starting $IMAGE"
docker run "${run_args[@]}" "$IMAGE" sleep infinity >/dev/null

(while true; do docker stats --no-stream --format '{{.MemUsage}}' "$NAME" >>"$RSS_FILE" 2>/dev/null; sleep 2; done) &
SAMPLER_PID=$!

(while true; do
  sleep 20
  r=$(live_rooms)
  if [ "$r" != "0" ]; then
    echo "live rooms: $r" >"$ABORT_FILE"
    echo "ABORT: LiveKit reports live rooms ($r); stopping the benchmark" >&2
    docker stop -t 2 "$NAME" >/dev/null 2>&1 || true
    exit 0
  fi
done) &
WATCHER_PID=$!

echo "Installing dependencies"
docker exec "$NAME" pip install -q --only-binary :all: --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
docker exec "$NAME" pip install -q --only-binary :all: -r /bench/requirements.txt
if [ -n "$HF_TOKEN_FILE" ]; then
  # IndicTransToolkit ships only as a source distribution (Cython).
  docker exec "$NAME" sh -c 'apt-get update -qq && apt-get install -y -qq --no-install-recommends build-essential >/dev/null'
  docker exec "$NAME" pip install -q IndicTransToolkit==1.1.1
fi

set +e
docker exec "$NAME" python -I /bench/speech_bench.py --work /work --out /out --threads 2 \
  --cpus "$CPUS" --memory "$MEMORY" "${bench_args[@]}" 2>&1 | tee "$OUT/run.log"
code=${PIPESTATUS[0]}
set -e
docker exec "$NAME" chown -R "$(id -u):$(id -g)" /out 2>/dev/null || true
[ -f "$ABORT_FILE" ] && code=3
echo "Output: $OUT"
exit $code
