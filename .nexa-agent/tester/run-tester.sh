#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/nexa-chess/NexaGen-dev"

cd "$ROOT"

test "$PWD" = "$ROOT"

export PATH="$HOME/.local/bin:$PATH"

PROMPT="$(cat .nexa-agent/tester/TESTER.md)

==================================================
CURRENT TASK
==================================================

$(cat .nexa-agent/tasks/current.md 2>/dev/null || echo 'No task supplied.')

==================================================
DEVELOPER CHANGES
==================================================

Inspect the current working tree and git diff.

==================================================
INSTRUCTION
==================================================

Independently test the implementation.

Do not modify application source.

Do not access production.

Write the complete test report to:

.nexa-agent/reports/tests/latest.md

Return PASS, FAIL, or BLOCKED.
"

opencode run "$PROMPT"
