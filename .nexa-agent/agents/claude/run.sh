#!/usr/bin/env bash
# Claude Code CLI -- headless, fresh session, one task packet in / one result JSON out.
# Usage: run.sh <packet.json>
set -euo pipefail

AGENT="claude"
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

# Orchestrator-derived budget wins; falls back to the static config value.
BUDGET="${NEXA_MAX_BUDGET_USD:-$(jq -r '.claude.max_budget_usd // 8' "$CFG")}"
TIMEOUT="$(jq -r '.claude.timeout_seconds // 2400' "$CFG")"
PACKET_MODEL="$(jq -r '.model // empty' "$PACKET")"
MODEL="${PACKET_MODEL:-${NEXA_CLAUDE_MODEL:-$(jq -r '.claude.model // empty' "$CFG")}}"

LOGDIR="$NEXA_AGENT_DIR/logs/$AGENT"
mkdir -p "$LOGDIR" "$(dirname "$RESULT_PATH")"
STEM="$LOGDIR/${TASK_ID}_${ROLE}_a${ATTEMPT}_s${SESSION}"
PROMPT_FILE="${STEM}.prompt.md"
RAW_FILE="${STEM}.raw.json"
USAGE_FILE="${STEM}.usage.json"

export NEXA_AGENT_DIR
"$LIB/build-prompt.sh" "$PACKET" > "$PROMPT_FILE"

# The branch must already exist and be checked out -- the orchestrator owns git setup.
CURRENT="$(git -C "$NEXA_DEV_ROOT" branch --show-current)"
[ "$CURRENT" = "$BRANCH" ] || guard_die "expected branch $BRANCH, on $CURRENT"

echo "[$AGENT] task=$TASK_ID role=$ROLE attempt=$ATTEMPT session=$SESSION branch=$BRANCH" >&2
echo "[$AGENT] prompt=$PROMPT_FILE ($(wc -c < "$PROMPT_FILE") bytes) budget=\$$BUDGET" >&2

rm -f "$RESULT_PATH"
set +e
timeout --signal=TERM --kill-after=60 "$TIMEOUT" \
  claude -p \
    --output-format json \
    --permission-mode bypassPermissions \
    --add-dir "$NEXA_DEV_ROOT" \
    --max-budget-usd "$BUDGET" \
    ${MODEL:+--model "$MODEL"} \
    < "$PROMPT_FILE" > "$RAW_FILE" 2>"${STEM}.stderr.log"
RC=$?
set -e

if [ $RC -eq 124 ] || [ $RC -eq 137 ]; then
  echo "[$AGENT] TIMEOUT after ${TIMEOUT}s" >&2
elif [ $RC -ne 0 ]; then
  echo "[$AGENT] CLI exited $RC (see ${STEM}.stderr.log)" >&2
fi

# Token accounting -- Claude is the one CLI that reports it. context-budget.ts reads this.
if jq -e '.usage' "$RAW_FILE" >/dev/null 2>&1; then
  jq '{
    input_tokens:            (.usage.input_tokens // 0),
    output_tokens:           (.usage.output_tokens // 0),
    cache_read_tokens:       (.usage.cache_read_input_tokens // 0),
    cache_creation_tokens:   (.usage.cache_creation_input_tokens // 0),
    total_cost_usd:          (.total_cost_usd // null),
    num_turns:               (.num_turns // null),
    duration_ms:             (.duration_ms // null),
    session_id:              (.session_id // null),
    is_error:                (.is_error // false),
    terminal_reason:         (.terminal_reason // null),
    api_error_status:        (.api_error_status // null),
    error_text:              (if (.is_error // false) then ((.result // "") | tostring | .[0:400]) else null end)
  }' "$RAW_FILE" > "$USAGE_FILE"
  echo "[$AGENT] usage -> $USAGE_FILE" >&2
else
  echo '{"note":"no usage in CLI output"}' > "$USAGE_FILE"
fi

# Fallback: if the agent narrated a result instead of writing the file, recover it.
if [ ! -f "$RESULT_PATH" ] && jq -e '.result' "$RAW_FILE" >/dev/null 2>&1; then
  jq -r '.result' "$RAW_FILE" > "$RESULT_PATH"
  echo "[$AGENT] result file missing; recovered from CLI stdout" >&2
fi

"$LIB/validate-result.sh" "$RESULT_PATH" "$ROLE"
echo "$RESULT_PATH"
