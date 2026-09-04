#!/usr/bin/env bash
#
# One conversational turn of the supervisor agent.
#
#   run.sh <agent> <model|-> <session-id|-> <message-file> <raw-out.json>
#
# Prints "SESSION=<id>" as its last stdout line so the caller can persist the
# session for the next turn.
#
# Unlike the worker wrappers in ../claude, ../antigravity and ../opencode, this
# one CONTINUES a conversation: continuity is the whole point of a chat. All
# three CLIs support it, but only Claude lets us choose the id up front --
# antigravity and opencode mint their own, so the id is captured from the first
# run's output and handed back to us.
#
# Permissions are the other inversion. Workers run with permissions bypassed and
# are fenced in by guard.sh. The supervisor is confined to READ-ONLY: an
# allowlist plus --permission-prompts none for Claude, and plan mode for the
# other two, which is the closest equivalent each offers. It can read the repo
# and drive the orchestrator CLI; it cannot edit a single file. Code changes only
# ever happen inside a task branch, by a worker, under test.
set -uo pipefail

AGENT="${1:?usage: run.sh <agent> <model|-> <session|-> <message-file> <raw-out>}"
MODEL="${2:--}"
SESSION_ID="${3:--}"
MESSAGE_FILE="${4:?message file required}"
RAW_OUT="${5:?raw output path required}"

[ "$MODEL" = "-" ] && MODEL=""
[ "$SESSION_ID" = "-" ] && SESSION_ID=""

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HERE/../_lib"
# shellcheck source=../_lib/guard.sh
. "$LIB/guard.sh"

CFG="$NEXA_AGENT_DIR/config/supervisor.json"
SYSTEM_PROMPT_FILE="$HERE/SUPERVISOR.md"
LOG_DIR="$NEXA_AGENT_DIR/logs/supervisor"
mkdir -p "$LOG_DIR"
STEM="$LOG_DIR/$(date +%Y%m%dT%H%M%S)_${AGENT}"

# The supervisor only reads and reports, so it works on whatever branch the repo
# is already on. It must never move HEAD -- a worker may be mid-task on a branch.
guard_workspace >/dev/null

BUDGET="${NEXA_SUPERVISOR_BUDGET_USD:-$(jq -r '.max_budget_usd // 3' "$CFG" 2>/dev/null || echo 3)}"
TIMEOUT="${NEXA_SUPERVISOR_TIMEOUT:-$(jq -r '.timeout_seconds // 300' "$CFG" 2>/dev/null || echo 300)}"

echo "[supervisor] agent=$AGENT model=${MODEL:-<default>} session=${SESSION_ID:-<new>}" >&2

SYSTEM_PROMPT="$(cat "$SYSTEM_PROMPT_FILE")"
NEW_SESSION=""

case "$AGENT" in
  claude)
    # Read-only repo access plus the orchestrator command surface. There is no
    # Write, no Edit and no bare Bash: an unlisted command is denied, not queued.
    ALLOWED=(
      "Bash(npm run agent:*)"
      "Bash(git log:*)"
      "Bash(git diff:*)"
      "Bash(git show:*)"
      "Bash(git status:*)"
      "Bash(git branch:*)"
      "Read"
      "Grep"
      "Glob"
    )
    if [ -n "$SESSION_ID" ]; then
      SESSION_FLAG=(--resume "$SESSION_ID")
    else
      SESSION_ID="$(cat /proc/sys/kernel/random/uuid)"
      SESSION_FLAG=(--session-id "$SESSION_ID")
    fi
    NEW_SESSION="$SESSION_ID"

    timeout --signal=TERM --kill-after=30 "$TIMEOUT" \
      claude -p \
        --output-format json \
        "${SESSION_FLAG[@]}" \
        --permission-prompts none \
        --allowedTools "${ALLOWED[@]}" \
        --add-dir "$NEXA_DEV_ROOT" \
        --append-system-prompt "$SYSTEM_PROMPT" \
        --max-budget-usd "$BUDGET" \
        ${MODEL:+--model "$MODEL"} \
        < "$MESSAGE_FILE" > "$RAW_OUT" 2>"${STEM}.stderr.log"
    RC=$?
    ;;

  antigravity)
    # agy has no tool allowlist; --mode plan is its read-only mode.
    if [ -n "$SESSION_ID" ]; then
      SESSION_FLAG=(--conversation "$SESSION_ID")
    else
      SESSION_FLAG=()
    fi

    timeout --signal=TERM --kill-after=30 "$TIMEOUT" \
      agy --print "$SYSTEM_PROMPT

---

$(cat "$MESSAGE_FILE")" \
        "${SESSION_FLAG[@]}" \
        --mode plan \
        --output-format json \
        ${MODEL:+--model "$MODEL"} \
        --print-timeout "${TIMEOUT}s" \
        > "$RAW_OUT" 2>"${STEM}.stderr.log"
    RC=$?
    NEW_SESSION="$(jq -r '.conversation_id // empty' "$RAW_OUT" 2>/dev/null || true)"
    ;;

  opencode)
    # opencode's "plan" agent is its read-only primary agent.
    if [ -n "$SESSION_ID" ]; then
      SESSION_FLAG=(--session "$SESSION_ID")
    else
      SESSION_FLAG=()
    fi

    timeout --signal=TERM --kill-after=30 "$TIMEOUT" \
      opencode run \
        --format json \
        --agent plan \
        "${SESSION_FLAG[@]}" \
        --dir "$NEXA_DEV_ROOT" \
        ${MODEL:+--model "$MODEL"} \
        "$SYSTEM_PROMPT

---

$(cat "$MESSAGE_FILE")" \
        > "$RAW_OUT" 2>"${STEM}.stderr.log"
    RC=$?
    # JSONL: the session id is stamped on every event, so take the first.
    NEW_SESSION="$(grep -o '"sessionID":"[^"]*"' "$RAW_OUT" 2>/dev/null | head -1 | cut -d'"' -f4 || true)"
    ;;

  *)
    echo "[supervisor] unknown agent: $AGENT" >&2
    exit 2
    ;;
esac

cp "$RAW_OUT" "${STEM}.raw.json" 2>/dev/null || true

if [ $RC -eq 124 ] || [ $RC -eq 137 ]; then
  echo "[supervisor] TIMEOUT after ${TIMEOUT}s" >&2
elif [ $RC -ne 0 ]; then
  echo "[supervisor] CLI exited $RC (see ${STEM}.stderr.log)" >&2
fi

# Last line, always: the caller persists this so the next turn continues.
echo "SESSION=${NEW_SESSION:-$SESSION_ID}"
exit $RC
