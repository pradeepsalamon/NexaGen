#!/usr/bin/env bash
# Shared safety guard for every agent wrapper.
#
# Agents run with CLI permission prompts bypassed, so the production boundary in
# config/SAFETY.md is enforced HERE, before any CLI is invoked -- not by the CLI.
# Sourced, not executed. Any failure aborts the dispatch.

NEXA_DEV_ROOT="/opt/nexa-chess/NexaGen-dev"
NEXA_PROD_ROOT="/opt/nexa-chess/NexaGen"
NEXA_DB_NAME="vps_dev"
NEXA_BRANCH_BASE="dev_vps"
NEXA_AGENT_DIR="${NEXA_DEV_ROOT}/.nexa-agent"

guard_die() {
  echo "SAFETY ABORT: $*" >&2
  exit 90
}

# 1. Workspace must be the development root, exactly.
guard_workspace() {
  cd "$NEXA_DEV_ROOT" 2>/dev/null || guard_die "cannot enter dev root $NEXA_DEV_ROOT"
  [ "$PWD" = "$NEXA_DEV_ROOT" ] || guard_die "cwd is $PWD, expected $NEXA_DEV_ROOT"
  [ -d "$NEXA_DEV_ROOT/.git" ] || guard_die "$NEXA_DEV_ROOT is not a git repository"
}

# 2. Nothing handed to an agent may reference the production root.
#    Matches /opt/nexa-chess/NexaGen only when NOT followed by -dev.
# The fields that INSTRUCT the agent. Deliberately not the whole packet.
#
# `prior_diff` is a verbatim git diff and `prior_report` is the previous agent's
# write-up -- both are evidence of what already happened, not orders. Scanning
# them made the guard fire on its own safety documentation: once .nexa-agent
# source began landing on dev_vps, any cumulative diff touching SAFETY.md or
# SUPERVISOR.md carried the very container names the guard looks for, and every
# dispatch aborted. Instructions are what can direct an agent at production; a
# diff cannot.
guard_instruction_fields() {
  local file="$1"
  jq -r '[.feature_summary, .relevant_paths[]?, .constraints[]?, .repo_path, .branch, .result_path] | join("\n")' "$file" 2>/dev/null
}

guard_no_prod_reference() {
  local file="$1"
  [ -f "$file" ] || guard_die "packet file not found: $file"
  if guard_instruction_fields "$file" | grep -Pq '/opt/nexa-chess/NexaGen(?!-dev)'; then
    guard_die "packet $file instructs the agent to work in production root $NEXA_PROD_ROOT"
  fi
}

# 3. The only database the autonomous loop may touch is vps_dev.
guard_database() {
  local envfile="$NEXA_DEV_ROOT/apps/api/.env"
  [ -f "$envfile" ] || { echo "guard: no apps/api/.env, skipping DB check" >&2; return 0; }
  local url db
  url="$(grep -m1 '^DATABASE_URL' "$envfile" | cut -d= -f2- | tr -d '"'"'"'')"
  [ -n "$url" ] || guard_die "DATABASE_URL not set in apps/api/.env"
  # strip query string, take last path segment
  db="${url%%\?*}"; db="${db##*/}"
  [ "$db" = "$NEXA_DB_NAME" ] || guard_die "DATABASE_URL targets '$db', only '$NEXA_DB_NAME' is permitted"
}

# 4. Production containers must never be in our control path.
guard_no_prod_containers() {
  local file="$1"
  if guard_instruction_fields "$file" | grep -Eq 'nexa_(web|api|postgres|redis|livekit|egress)'; then
    guard_die "packet $file instructs the agent to act on a production container"
  fi
}

# Run the full guard against a packet file.
nexa_guard() {
  local packet="$1"
  guard_workspace
  guard_no_prod_reference "$packet"
  guard_no_prod_containers "$packet"
  guard_database
}
