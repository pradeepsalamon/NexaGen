#!/usr/bin/env bash
# Fills the `nexa_ollama_models` volume used by compose.ai.yml's `ollama`
# service with the class-recap model (docs/CLASS_RECAPS.md). The service sits
# on an internal network with no internet, so the weights are downloaded once
# here by a throwaway container of the same pinned image, which is removed
# afterwards. Refuses any model other than the approved one (OD-25) unless
# --allow-other-model is given.
#
#   scripts/ai/pull-model.sh            # qwen2.5:3b
#   scripts/ai/pull-model.sh --check    # only report what the volume holds
set -euo pipefail

IMAGE="ollama/ollama:0.34.4@sha256:8262851b2846b87c649eddf3e76beb270c52f4d1bc94559f47efde16b0841551"
VOLUME=nexa_ollama_models
MODEL=qwen2.5:3b
# The weights layer of qwen2.5:3b as benchmarked on 2026-10-25 (INFRASTRUCTURE_DECISION.md §4.6).
APPROVED_MODEL=qwen2.5:3b
APPROVED_BLOB_PREFIX=5ee4f07cdb9b
NAME=nexa_ollama_pull
CHECK_ONLY=false
ALLOW_OTHER=false

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift ;;
    --check) CHECK_ONLY=true ;;
    --allow-other-model) ALLOW_OTHER=true ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

if [ "$MODEL" != "$APPROVED_MODEL" ] && [ "$ALLOW_OTHER" != true ]; then
  echo "REFUSED: $MODEL is not the approved model ($APPROVED_MODEL). Pass --allow-other-model to try another." >&2
  exit 1
fi

docker volume create "$VOLUME" >/dev/null
docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -v "$VOLUME:/root/.ollama" "$IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" ollama list >/dev/null 2>&1 && break
  sleep 1
done

if [ "$CHECK_ONLY" != true ]; then
  docker exec "$NAME" ollama pull "$MODEL"
fi
docker exec "$NAME" ollama list

if [ "$MODEL" = "$APPROVED_MODEL" ]; then
  if docker exec "$NAME" sh -c "ls /root/.ollama/models/blobs" | grep -q "^sha256-$APPROVED_BLOB_PREFIX"; then
    echo "ok  $MODEL weights match the benchmarked layer ($APPROVED_BLOB_PREFIX…)"
  else
    echo "WARNING: $MODEL weights differ from the benchmarked layer ($APPROVED_BLOB_PREFIX…); re-run the quality check before using it." >&2
    exit 2
  fi
fi
