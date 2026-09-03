#!/usr/bin/env bash
# OpenCode CLI -- headless, fresh session. Default agent for the tester-e2e role.
# Usage: run.sh <packet.json>
set -euo pipefail

AGENT="opencode"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../_lib" && pwd)"
# shellcheck source=../_lib/guard.sh
source "$LIB/guard.sh"

PACKET="${1:?usage: run.sh <packet.json>}"
PACKET="$(readlink -f "$PACKET")"
nexa_guard "$PACKET"

CFG="$NEXA_AGENT_DIR/config/agents.json"
TASK_ID="$(jq -r '.task_id' "$PACKET")"
ROLE="$(jq -r '.role' "$PACKET")"
ATTEMPT="$(jq -r '.attempt // 1' "$PACKET")"
SESSION="$(jq -r '.session // 1' "$PACKET")"
RESULT_PATH="$(jq -r '.result_path' "$PACKET")"
BRANCH="$(jq -r '.branch' "$PACKET")"

TIMEOUT="$(jq -r '.opencode.timeout_seconds // 2400' "$CFG")"
MODEL="${NEXA_OPENCODE_MODEL:-$(jq -r '.opencode.model // empty' "$CFG")}"
AUTO_FLAG="$(jq -r '.opencode.permission_flag // "--auto"' "$CFG")"

LOGDIR="$NEXA_AGENT_DIR/logs/$AGENT"
mkdir -p "$LOGDIR" "$(dirname "$RESULT_PATH")"
STEM="$LOGDIR/${TASK_ID}_${ROLE}_a${ATTEMPT}_s${SESSION}"
PROMPT_FILE="${STEM}.prompt.md"
RAW_FILE="${STEM}.raw.json"

export NEXA_AGENT_DIR
"$LIB/build-prompt.sh" "$PACKET" > "$PROMPT_FILE"

CURRENT="$(git -C "$NEXA_DEV_ROOT" branch --show-current)"
[ "$CURRENT" = "$BRANCH" ] || guard_die "expected branch $BRANCH, on $CURRENT"

echo "[$AGENT] task=$TASK_ID role=$ROLE attempt=$ATTEMPT branch=$BRANCH" >&2
echo "[$AGENT] prompt=$PROMPT_FILE ($(wc -c < "$PROMPT_FILE") bytes)" >&2

START=$(date +%s)
rm -f "$RESULT_PATH"
set +e
timeout --signal=TERM --kill-after=60 "$TIMEOUT" \
  opencode run \
    --format json \
    "$AUTO_FLAG" \
    --dir "$NEXA_DEV_ROOT" \
    ${MODEL:+--model "$MODEL"} \
    "$(cat "$PROMPT_FILE")" \
    > "$RAW_FILE" 2>"${STEM}.stderr.log"
RC=$?
set -e
ELAPSED=$(( $(date +%s) - START ))

if [ $RC -eq 124 ] || [ $RC -eq 137 ]; then
  echo "[$AGENT] TIMEOUT after ${TIMEOUT}s" >&2
elif [ $RC -ne 0 ]; then
  echo "[$AGENT] CLI exited $RC (see ${STEM}.stderr.log)" >&2
fi

cat > "${STEM}.usage.json" <<USAGE
{"note":"token accounting unavailable for opencode CLI; wall-clock proxy only",
 "elapsed_seconds":${ELAPSED},"exit_code":${RC}}
USAGE
echo "[$AGENT] elapsed=${ELAPSED}s (no token accounting available)" >&2

if [ ! -f "$RESULT_PATH" ] && [ -s "$RAW_FILE" ]; then
  cp "$RAW_FILE" "$RESULT_PATH"
  echo "[$AGENT] result file missing; attempting recovery from CLI stdout" >&2
fi

"$LIB/validate-result.sh" "$RESULT_PATH" "$ROLE"
echo "$RESULT_PATH"
