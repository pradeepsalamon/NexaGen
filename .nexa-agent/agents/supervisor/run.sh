#!/usr/bin/env bash
#
# One conversational turn of the supervisor agent.
#
#   run.sh <session-uuid> <message-file> <raw-out.json> [--new]
#
# Unlike the worker wrappers in ../claude, ../antigravity and ../opencode, this
# one RESUMES a session: a conversation is the single place continuity is the
# point. Workers get a fresh session every time so their input is reproducible;
# the supervisor keeps its memory of what the human already told it.
#
# Permissions are the other inversion. Workers run with permissions bypassed and
# are fenced in by guard.sh. The supervisor instead gets an explicit allowlist
# and `--permission-prompts none`, so anything outside that list is denied
# automatically rather than executed. It can read the repo and drive the
# orchestrator CLI; it cannot edit a single file. Code changes only ever happen
# inside a task branch, by a worker, under test.
set -euo pipefail

SESSION_ID="${1:?usage: run.sh <session-uuid> <message-file> <raw-out> [--new]}"
MESSAGE_FILE="${2:?message file required}"
RAW_OUT="${3:?raw output path required}"
MODE="${4:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HERE/../_lib"
# shellcheck source=../_lib/guard.sh
. "$LIB/guard.sh"

CFG="$NEXA_AGENT_DIR/config/supervisor.json"
SYSTEM_PROMPT_FILE="$HERE/SUPERVISOR.md"
LOG_DIR="$NEXA_AGENT_DIR/logs/supervisor"
mkdir -p "$LOG_DIR"
STEM="$LOG_DIR/${SESSION_ID}_$(date +%Y%m%dT%H%M%S)"

# The supervisor only reads and reports, so it works on whatever branch the repo
# is already on. It must never move HEAD -- a worker may be mid-task on a branch.
guard_workspace >/dev/null

MODEL="${NEXA_SUPERVISOR_MODEL:-$(jq -r '.model // empty' "$CFG" 2>/dev/null || true)}"
BUDGET="${NEXA_SUPERVISOR_BUDGET_USD:-$(jq -r '.max_budget_usd // 3' "$CFG" 2>/dev/null || echo 3)}"
TIMEOUT="${NEXA_SUPERVISOR_TIMEOUT:-$(jq -r '.timeout_seconds // 300' "$CFG" 2>/dev/null || echo 300)}"

if [ "$MODE" = "--new" ]; then
  SESSION_FLAG=(--session-id "$SESSION_ID")
else
  SESSION_FLAG=(--resume "$SESSION_ID")
fi

# Read-only repo access plus the orchestrator command surface. Note there is no
# Write, no Edit, and no bare Bash: an unlisted command is denied, not queued.
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

echo "[supervisor] session=$SESSION_ID mode=${MODE:-resume} budget=\$$BUDGET" >&2

set +e
timeout --signal=TERM --kill-after=30 "$TIMEOUT" \
  claude -p \
    --output-format json \
    "${SESSION_FLAG[@]}" \
    --permission-prompts none \
    --allowedTools "${ALLOWED[@]}" \
    --add-dir "$NEXA_DEV_ROOT" \
    --append-system-prompt "$(cat "$SYSTEM_PROMPT_FILE")" \
    --max-budget-usd "$BUDGET" \
    ${MODEL:+--model "$MODEL"} \
    < "$MESSAGE_FILE" > "$RAW_OUT" 2>"${STEM}.stderr.log"
RC=$?
set -e

cp "$RAW_OUT" "${STEM}.raw.json" 2>/dev/null || true

if [ $RC -eq 124 ] || [ $RC -eq 137 ]; then
  echo "[supervisor] TIMEOUT after ${TIMEOUT}s" >&2
elif [ $RC -ne 0 ]; then
  echo "[supervisor] CLI exited $RC (see ${STEM}.stderr.log)" >&2
fi

exit $RC
