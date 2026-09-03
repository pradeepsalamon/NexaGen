#!/usr/bin/env bash
# Antigravity CLI (gemini-3.1-pro-high) -- headless, fresh session.
#
# Headless permission fix: ~/.gemini/antigravity-cli/settings.json is IGNORED in
# print mode (the v1 silent-hang cause). The skip-permissions flag is the only
# thing that works there, so the production boundary is enforced by guard.sh
# above instead of by the CLI's own allow/deny list.
# Usage: run.sh <packet.json>
set -euo pipefail

AGENT="antigravity"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../_lib" && pwd)"
# shellcheck source=../_lib/guard.sh
source "$LIB/guard.sh"

PACKET="${1:?usage: run.sh <packet.json>}"
PACKET="$(readlink -f "$PACKET")"
nexa_guard "$PACKET"

export PATH="$HOME/.local/bin:$PATH"
CFG="$NEXA_AGENT_DIR/config/agents.json"
TASK_ID="$(jq -r '.task_id' "$PACKET")"
ROLE="$(jq -r '.role' "$PACKET")"
ATTEMPT="$(jq -r '.attempt // 1' "$PACKET")"
SESSION="$(jq -r '.session // 1' "$PACKET")"
RESULT_PATH="$(jq -r '.result_path' "$PACKET")"
BRANCH="$(jq -r '.branch' "$PACKET")"

PACKET_MODEL="$(jq -r '.model // empty' "$PACKET")"
MODEL="${PACKET_MODEL:-$(jq -r '.antigravity.model // "gemini-3.1-pro-high"' "$CFG")}"
TIMEOUT="$(jq -r '.antigravity.timeout_seconds // 2700' "$CFG")"
SKIP_PERMS="$(jq -r '.antigravity.permission_flag // "--dangerously-skip-permissions"' "$CFG")"

EFFORT="high"
case "$MODEL" in
  *-low) EFFORT="low" ;;
  *-medium) EFFORT="medium" ;;
  *-high) EFFORT="high" ;;
esac

LOGDIR="$NEXA_AGENT_DIR/logs/$AGENT"
mkdir -p "$LOGDIR" "$(dirname "$RESULT_PATH")"
STEM="$LOGDIR/${TASK_ID}_${ROLE}_a${ATTEMPT}_s${SESSION}"
PROMPT_FILE="${STEM}.prompt.md"
RAW_FILE="${STEM}.raw.json"

export NEXA_AGENT_DIR
"$LIB/build-prompt.sh" "$PACKET" > "$PROMPT_FILE"

CURRENT="$(git -C "$NEXA_DEV_ROOT" branch --show-current)"
[ "$CURRENT" = "$BRANCH" ] || guard_die "expected branch $BRANCH, on $CURRENT"

echo "[$AGENT] task=$TASK_ID role=$ROLE attempt=$ATTEMPT model=$MODEL effort=$EFFORT branch=$BRANCH" >&2
echo "[$AGENT] prompt=$PROMPT_FILE ($(wc -c < "$PROMPT_FILE") bytes)" >&2

# agy has no token accounting -- log wall clock as the proxy (spec section 7).
START=$(date +%s)
rm -f "$RESULT_PATH"
set +e
timeout --signal=TERM --kill-after=60 "$TIMEOUT" \
  agy --print "$(cat "$PROMPT_FILE")" \
      --model "$MODEL" \
      --effort "$EFFORT" \
      --output-format json \
      "$SKIP_PERMS" \
      --print-timeout 40m \
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
{"note":"token accounting unavailable for antigravity CLI; wall-clock proxy only",
 "elapsed_seconds":${ELAPSED},"exit_code":${RC}}
USAGE
echo "[$AGENT] elapsed=${ELAPSED}s (no token accounting available)" >&2

if [ ! -f "$RESULT_PATH" ]; then
  for q in '.response' '.result' '.text'; do
    if jq -e "$q" "$RAW_FILE" >/dev/null 2>&1; then
      jq -r "$q" "$RAW_FILE" > "$RESULT_PATH"
      echo "[$AGENT] result file missing; recovered from CLI stdout ($q)" >&2
      break
    fi
  done
fi

"$LIB/validate-result.sh" "$RESULT_PATH" "$ROLE"
echo "$RESULT_PATH"
