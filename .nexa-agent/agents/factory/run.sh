#!/usr/bin/env bash
# Factory.ai "droid" CLI -- headless (`droid exec`), fresh session, one task
# packet in / one result JSON out.
#
# UNVERIFIED: droid is not yet installed on this box. The flags below are
# transcribed from https://docs.factory.ai/reference/cli-reference (Sept 2026),
# not tested. See config/agents.json "_unverified_note". Once droid is installed
# and `droid exec --help` has been reconciled with this file, drop "factory"
# from agents.json "_unverified".
#
# Headless permissions: `droid exec` is read-only by default. `--auto medium`
# lets it create/edit files, install deps, build/test and make LOCAL git
# commits -- which is what a worker role needs. It still cannot push or deploy
# (that is `--auto high`), and the production boundary is enforced by guard.sh
# below regardless of the CLI's own tier.
# Usage: run.sh <packet.json>
set -euo pipefail

AGENT="factory"
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

# Auth: FACTORY_API_KEY in the environment, or an interactive `droid` login that
# left ~/.factory/ behind. Fail loud rather than let droid drop to a prompt in a
# headless run (the antigravity v1 silent-hang lesson).
if [ -z "${FACTORY_API_KEY:-}" ] && [ ! -d "$HOME/.factory" ]; then
  guard_die "factory agent: no FACTORY_API_KEY set and no ~/.factory login. \
Run: export FACTORY_API_KEY=fk-...  (or \`droid\` once to log in)"
fi

command -v droid >/dev/null 2>&1 || guard_die "factory agent: 'droid' CLI not on PATH. \
Install: curl -fsSL https://app.factory.ai/cli | sh   (or: npm i -g droid)"

TIMEOUT="$(jq -r '.factory.timeout_seconds // 4800' "$CFG")"
PACKET_MODEL="$(jq -r '.model // empty' "$PACKET")"
MODEL="${PACKET_MODEL:-${NEXA_FACTORY_MODEL:-$(jq -r '.factory.default_model // empty' "$CFG")}}"
# "default" is the placeholder the UI picker shows, not a real model id.
[ "$MODEL" = "default" ] && MODEL=""

# Autonomy tier. Reviewer is read-only; everyone else needs at least local
# commits. NEXA_FACTORY_AUTO overrides for one run.
AUTO="$(jq -r '.factory.auto_level // "medium"' "$CFG")"
case "$ROLE" in
  reviewer) AUTO="low" ;;
esac
AUTO="${NEXA_FACTORY_AUTO:-$AUTO}"

LOGDIR="$NEXA_AGENT_DIR/logs/$AGENT"
mkdir -p "$LOGDIR" "$(dirname "$RESULT_PATH")"
STEM="$LOGDIR/${TASK_ID}_${ROLE}_a${ATTEMPT}_s${SESSION}"
PROMPT_FILE="${STEM}.prompt.md"
RAW_FILE="${STEM}.raw.json"

export NEXA_AGENT_DIR
"$LIB/build-prompt.sh" "$PACKET" > "$PROMPT_FILE"

CURRENT="$(git -C "$NEXA_DEV_ROOT" branch --show-current)"
[ "$CURRENT" = "$BRANCH" ] || guard_die "expected branch $BRANCH, on $CURRENT"

echo "[$AGENT] task=$TASK_ID role=$ROLE attempt=$ATTEMPT auto=$AUTO branch=$BRANCH" >&2
echo "[$AGENT] prompt=$PROMPT_FILE ($(wc -c < "$PROMPT_FILE") bytes)" >&2

START=$(date +%s)
rm -f "$RESULT_PATH"
set +e
timeout --signal=TERM --kill-after=60 "$TIMEOUT" \
  droid exec \
    -f "$PROMPT_FILE" \
    --output-format json \
    --auto "$AUTO" \
    --cwd "$NEXA_DEV_ROOT" \
    ${MODEL:+--model "$MODEL"} \
    > "$RAW_FILE" 2>"${STEM}.stderr.log"
RC=$?
set -e
ELAPSED=$(( $(date +%s) - START ))

if [ $RC -eq 124 ] || [ $RC -eq 137 ]; then
  echo "[$AGENT] TIMEOUT after ${TIMEOUT}s" >&2
elif [ $RC -ne 0 ]; then
  echo "[$AGENT] CLI exited $RC (see ${STEM}.stderr.log)" >&2
fi

# No token accounting in droid's JSON envelope -- wall clock is the proxy. Carry
# through what it does report so context-budget.ts / isTruncated can see an error.
if jq -e . "$RAW_FILE" >/dev/null 2>&1; then
  jq '{
    note:            "token accounting unavailable for factory (droid) CLI; wall-clock proxy only",
    elapsed_seconds: '"$ELAPSED"',
    exit_code:       '"$RC"',
    is_error:        (.is_error // false),
    duration_ms:     (.duration_ms // null),
    num_turns:       (.num_turns // null),
    session_id:      (.session_id // null),
    subtype:         (.subtype // null)
  }' "$RAW_FILE" > "${STEM}.usage.json"
else
  cat > "${STEM}.usage.json" <<USAGE
{"note":"token accounting unavailable for factory (droid) CLI; wall-clock proxy only",
 "elapsed_seconds":${ELAPSED},"exit_code":${RC}}
USAGE
fi
echo "[$AGENT] elapsed=${ELAPSED}s (no token accounting available)" >&2

# Fallback: if the agent narrated a result instead of writing the file, recover
# it from droid's `result` field.
if [ ! -f "$RESULT_PATH" ] && jq -e '.result' "$RAW_FILE" >/dev/null 2>&1; then
  jq -r '.result' "$RAW_FILE" > "$RESULT_PATH"
  echo "[$AGENT] result file missing; recovered from CLI stdout" >&2
fi

"$LIB/validate-result.sh" "$RESULT_PATH" "$ROLE"
echo "$RESULT_PATH"
