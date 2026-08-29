#!/bin/bash
# ============================================================
# Nexa AI — QA Verification Script
# ============================================================
# Run this after implementing a task to verify everything passes.
# Usage: .ai/scripts/verify.sh [--skip-build]
# ============================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIR"

SKIP_BUILD=false
if [ "$1" = "--skip-build" ]; then
  SKIP_BUILD=true
fi

PASS=0
FAIL=0
WARN=0

report() {
  local status=$1
  local name=$2
  local detail=$3
  if [ "$status" = "PASS" ]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  elif [ "$status" = "FAIL" ]; then
    echo "  ❌ $name: $detail"
    FAIL=$((FAIL + 1))
  else
    echo "  ⚠️  $name: $detail"
    WARN=$((WARN + 1))
  fi
}

echo "============================================"
echo "  Nexa AI — QA Verification"
echo "  Project: $DIR"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# 1. Git Status
echo "── Git Status ──"
BRANCH=$(git branch --show-current)
DIRTY=$(git status --short | wc -l)
echo "  Branch: $branch"
if [ "$DIRTY" -gt 0 ]; then
  report "WARN" "Uncommitted changes" "$DIRTY files"
else
  report "PASS" "Working tree clean"
fi
echo ""

# 2. TypeScript Check
echo "── TypeScript Type Check ──"
if npm run typecheck 2>&1 | tail -3 | grep -q "error"; then
  report "FAIL" "typecheck" "TypeScript errors found"
else
  report "PASS" "typecheck"
fi
echo ""

# 3. Lint
echo "── ESLint ──"
LINT_OUT=$(npm run lint 2>&1)
LINT_ERRORS=$(echo "$LINT_OUT" | grep -c "error" || true)
LINT_WARNINGS=$(echo "$LINT_OUT" | grep -c "warning" || true)
if [ "$LINT_ERRORS" -gt 0 ]; then
  report "FAIL" "lint" "$LINT_ERRORS errors"
elif [ "$LINT_WARNINGS" -gt 0 ]; then
  report "WARN" "lint" "$LINT_WARNINGS warnings (0 errors)"
else
  report "PASS" "lint"
fi
echo ""

# 4. Build
if [ "$SKIP_BUILD" = false ]; then
  echo "── Build ──"
  if npm run build 2>&1 | tail -3 | grep -qi "error"; then
    report "FAIL" "build" "Build failed"
  else
    report "PASS" "build"
  fi
  echo ""
fi

# 5. Unit Tests
echo "── Unit Tests ──"
TEST_OUT=$(npm run test 2>&1 || true)
TEST_PASS=$(echo "$TEST_OUT" | grep -oP 'Tests:\s+\K\d+ passed' || echo "unknown")
TEST_FAIL=$(echo "$TEST_OUT" | grep -oP '\d+ failed' || echo "")
if [ -n "$TEST_FAIL" ]; then
  report "FAIL" "unit tests" "$TEST_FAIL"
else
  report "PASS" "unit tests" "$TEST_PASS"
fi
echo ""

# 6. Git Diff Summary
echo "── Changes Summary ──"
DIFF_STAT=$(git diff --stat dev 2>/dev/null || echo "No diff available")
echo "  $DIFF_STAT"
echo ""

# Summary
echo "============================================"
echo "  RESULTS: $PASS passed, $FAIL failed, $WARN warnings"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo "  ❌ VERIFICATION FAILED"
  exit 1
else
  echo "  ✅ VERIFICATION PASSED"
  exit 0
fi
