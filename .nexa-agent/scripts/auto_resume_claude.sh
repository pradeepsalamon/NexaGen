#!/usr/bin/env bash
set -uo pipefail

TARGET_EPOCH=1788468600 # 20:50:00 UTC
SESSION_ID="7e6687dc-68c3-49da-869b-a7cf4f685695"
DEV_ROOT="/opt/nexa-chess/NexaGen-dev"
PROMPT_FILE="$DEV_ROOT/.nexa-agent/orchestrator/chat/resume_prompt.md"
LOG_FILE="$DEV_ROOT/.nexa-agent/logs/auto_resume_claude.log"

echo "=== Auto-Resume Claude Monitor Started ===" | tee -a "$LOG_FILE"
echo "Current UTC Time : $(date -u)" | tee -a "$LOG_FILE"
echo "Target Reset Time: $(date -u -d @$TARGET_EPOCH) (Epoch: $TARGET_EPOCH)" | tee -a "$LOG_FILE"
echo "Session ID       : $SESSION_ID" | tee -a "$LOG_FILE"
echo "Log File         : $LOG_FILE" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"

NOW=$(date -u +%s)
SLEEP_SECS=$((TARGET_EPOCH - NOW - 15))

if [ $SLEEP_SECS -gt 0 ]; then
  echo "[$(date -u +%T)] Sleeping for ${SLEEP_SECS}s until near reset time..." | tee -a "$LOG_FILE"
  sleep "$SLEEP_SECS"
fi

echo "[$(date -u +%T)] Starting polling for Claude limit reset..." | tee -a "$LOG_FILE"

MAX_ATTEMPTS=60
ATTEMPT=0
UNLOCKED=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  POLL_OUT=$(claude -p --output-format json "ping" 2>&1 || true)
  
  if echo "$POLL_OUT" | grep -qi "session limit"; then
    echo "[$(date -u +%T)] Attempt $ATTEMPT: Still limited ($POLL_OUT). Retrying in 10s..." | tee -a "$LOG_FILE"
    sleep 10
  else
    echo "[$(date -u +%T)] Attempt $ATTEMPT: LIMIT CLEARED! Claude is responsive." | tee -a "$LOG_FILE"
    UNLOCKED=1
    break
  fi
done

if [ $UNLOCKED -ne 1 ]; then
  echo "[$(date -u +%T)] ERROR: Limit did not clear after $MAX_ATTEMPTS attempts." | tee -a "$LOG_FILE"
  exit 1
fi

echo "====================================================" | tee -a "$LOG_FILE"
echo "[$(date -u +%T)] TRIGGERING CLAUDE TO FINISH TASK & PHASES" | tee -a "$LOG_FILE"
echo "====================================================" | tee -a "$LOG_FILE"

cd "$DEV_ROOT/.nexa-agent"

claude -r "$SESSION_ID" \
  --permission-mode bypassPermissions \
  --add-dir "$DEV_ROOT" \
  -p "$(cat "$PROMPT_FILE")" 2>&1 | tee -a "$LOG_FILE"

RC=$?

echo "====================================================" | tee -a "$LOG_FILE"
echo "[$(date -u +%T)] Claude execution completed with exit code: $RC" | tee -a "$LOG_FILE"
echo "====================================================" | tee -a "$LOG_FILE"

# Post-completion check
echo "Checking orchestrator status..." | tee -a "$LOG_FILE"
npx ts-node --project "$DEV_ROOT/.nexa-agent/tsconfig.json" "$DEV_ROOT/.nexa-agent/orchestrator/cli.ts" status 2>&1 | tee -a "$LOG_FILE"

exit $RC
