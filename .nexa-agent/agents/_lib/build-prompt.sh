#!/usr/bin/env bash
# Renders a task packet (JSON) into the single self-contained prompt an agent receives.
# No agent ever sees prior chat -- this file is its entire input.
# Usage: build-prompt.sh <packet.json>   -> prompt text on stdout
set -euo pipefail
PACKET="$1"
J() { jq -r "$1 // empty" "$PACKET"; }

TASK_ID="$(J .task_id)"; ROLE="$(J .role)"; ATTEMPT="$(J .attempt)"
BRANCH="$(J .branch)"; REPO="$(J .repo_path)"; SESSION="$(J .session)"
RESULT_PATH="$(J .result_path)"
SCHEMA="${NEXA_AGENT_DIR:-$REPO/.nexa-agent}/orchestrator/result-schema.json"

cat <<HDR
# NEXACHESS AUTONOMOUS AGENT -- ROLE: ${ROLE}

You are running headless, in a fresh session with no memory of any prior
conversation. This document is your complete input. Do the work, commit it,
write your result file, and stop.

task_id : ${TASK_ID}
role    : ${ROLE}
attempt : ${ATTEMPT}${SESSION:+  (session ${SESSION} of this role-step)}
branch  : ${BRANCH}
repo    : ${REPO}

## NON-NEGOTIABLE SAFETY BOUNDARY

Read ${REPO}/.nexa-agent/config/SAFETY.md before making any change.

- The ONLY workspace is ${REPO}. Never read or write the production tree.
- The ONLY database is vps_dev. Never point tooling at another database.
- Never start, stop, restart, rebuild or remove any production container or
  LiveKit/PostgreSQL infrastructure.
- Never push, never merge, never deploy. You work on branch ${BRANCH} only.
- If you are unsure whether an action affects production: stop and report
  status "blocked" instead of guessing.

## PROJECT CONVENTIONS

${REPO}/CLAUDE.md is authoritative for architecture and code style. The rules
that silently break the build are in its section 7 -- follow them:
new Prisma model needs a getter in prisma.service.ts; schema changes need a
migration; new/changed endpoints go in API_ROUTES + packages/types first;
new API modules copy the token-string auth pattern (no guards); soft deletes
route through TrashRepository.softDelete; reuse components/ui primitives.

## TASK

HDR

J .feature_summary
echo

RP="$(jq -r 'if (.relevant_paths|length) > 0 then (.relevant_paths|join("\n- ")) else empty end' "$PACKET")"
if [ -n "$RP" ]; then printf '## LIKELY RELEVANT PATHS\n\n- %s\n\n' "$RP"; fi

BUDGET_TOKENS="$(J .context_budget.budget_tokens)"
if [ -n "$BUDGET_TOKENS" ]; then
cat <<BUD

## CONTEXT BUDGET -- READ THIS BEFORE YOU START

You have a context budget of ${BUDGET_TOKENS} tokens for this session
($(J .context_budget.budget_pct)% of a $(J .context_budget.window_tokens)-token window).
This is session $(J .context_budget.session) of at most $(J .context_budget.max_sessions)
for this role-step.

If you judge that you cannot finish the task within that budget, DO NOT push on
and run out mid-edit. Instead, stop cleanly at a coherent point and:

1. Commit whatever complete, working work you already have.
2. Set "status": "done" and fill "handoff_summary" with a COMPACT continuation
   brief for the next session -- which is a fresh session that will see none of
   your reasoning, only your commit, this task packet, and that summary:
     - what is finished and committed
     - what remains, in priority order
     - key file paths and the specific functions/lines involved
     - decisions you already made that the next session must not relitigate
     - open questions or traps you hit
3. Keep handoff_summary under ~400 words. It is a baton, not a diary.

Leaving "handoff_summary" empty means "this role-step is COMPLETE". Only set it
when you genuinely want a continuation session. Do not set it out of caution --
a spurious continuation wastes a whole session.
BUD
fi

if [ -n "$(J .prior_report)" ]; then
  printf '## REPORT FROM THE PREVIOUS AGENT\n\nThis is what the previous step produced. Address it.\n\n'
  J .prior_report; echo
fi

if [ -n "$(J .handoff_summary)" ]; then
  printf '## CONTINUATION HANDOFF\n\nA previous session of THIS role-step hit its context budget and checkpointed.\nIt is not a failure -- pick up exactly where it left off:\n\n'
  J .handoff_summary; echo
fi

if [ -n "$(J .prior_diff)" ]; then
  printf '## WORK ALREADY ON THIS BRANCH (cumulative diff)\n\nThis is the real diff, not a description. Read it before changing anything.\n\n```diff\n'
  J .prior_diff
  printf '\n```\n\n'
fi

printf '## CONSTRAINTS\n\n'
jq -r 'if (.constraints|length) > 0 then (.constraints[]|"- "+.) else empty end' "$PACKET"
echo

cat <<OUT

## REQUIRED OUTPUT

When you have finished, write a JSON result file to EXACTLY this path:

  ${RESULT_PATH}

It must validate against ${SCHEMA}:

{
  "status": "done" | "blocked",
  "diff_summary": "what you changed and why",
  "files_changed": ["repo/relative/path.ts"],
  "commit_sha": "<sha of the commit you made on ${BRANCH}>",
  "notes": "anything the next agent needs to know",
  "test_report": null
}

Rules for the result file:
- Write it even if you failed. status "blocked" plus an explanatory note is a
  valid, useful outcome; a missing file is not.
- commit_sha may be null when status is "blocked", or when your role does not
  commit (tester-e2e, reviewer). Every other role must supply a real SHA.
- Write raw JSON only -- no markdown fences, no commentary around it.
OUT

if [ "$ROLE" = "tester-e2e" ]; then
cat <<'TEST'

## TESTER-SPECIFIC RULES

You are the INDEPENDENT TESTER. Your job is to find defects, not to fix them.

- Do NOT modify application source. Do not commit. commit_sha must be null.
- Assume the developer is wrong until the code shows otherwise.
- Run what is actually runnable and report honestly: typecheck, lint, the API
  Jest suite, and a web build if apps/web changed. Never claim a command passed
  unless you ran it and saw it pass.
- Check mobile-first behaviour at 360px / 390px / 430px for any UI change:
  horizontal overflow, clipped controls, unusable tables, touch target size,
  modal overflow, loading/empty/error states.
- Check authorization, row-level visibility and regressions.
- Repo-wide checks (typecheck, lint, the full suite) may already be failing for
  reasons unrelated to this diff. Do NOT fail the task for a pre-existing
  breakage you did not cause -- but you MUST still report it, as a "minor"
  failure entry titled "pre-existing: ..." with the exact command and error, so
  a human knows the baseline is red. Silently passing over it is a defect in
  your report.

"test_report" is REQUIRED and must not be null:

  "test_report": {
    "pass": true | false,
    "failures": [
      { "title": "...", "detail": "repro + expected vs actual",
        "severity": "critical" | "major" | "minor",
        "files": ["apps/api/src/x/x.service.ts"] }
    ]
  }

pass must be false if any meaningful defect exists. An empty failures array
with pass false is contradictory -- never emit it. Set status "blocked" (not
pass true) if the environment prevented you from testing.
TEST
fi
