#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/nexa-chess/NexaGen-dev"

cd "$ROOT"

test "$PWD" = "$ROOT"

export PATH="$HOME/.local/bin:$PATH"

MODEL="gemini-3.1-pro-high"

PROMPT="$(cat .nexa-agent/developer/DEVELOPER.md)

==================================================
CURRENT TASK
==================================================

$(cat .nexa-agent/tasks/current.md 2>/dev/null || echo 'No task supplied.')

==================================================
LATEST TESTER REPORT
==================================================

$(cat .nexa-agent/reports/tests/latest.md 2>/dev/null || echo 'No tester report yet.')

==================================================
INSTRUCTION
==================================================

Implement the current task completely.

If a previous tester report exists, fix every meaningful defect reported there.

Do not modify production.

Do not access /opt/nexa-chess/NexaGen.

Use only vps_dev.

Build mobile-first UI where UI is involved.

Run relevant validation before finishing.

Do not declare the implementation PASS.
"

agy \
  --model "$MODEL" \
  --effort high \
  --print-timeout 30m \
  --output-format text \
  -p "$PROMPT"
