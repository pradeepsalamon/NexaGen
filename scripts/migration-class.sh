#!/usr/bin/env bash
# =========================================================
# Classifies Prisma migrations for rollback safety
# (docs/DEPLOY_ROLLBACK_HARDENING.md § "Rollback classes").
#
#   A  additive: old code keeps working, an image rollback is safe
#   B  adds an enum value: rollback safe only until a row uses the value
#   C  contract (drop, rename, NOT NULL, type change, trigger, truncate):
#      old code can't run on it, never roll the images back past it
#
# Usage:
#   scripts/migration-class.sh [--ci] <migration dir or migration.sql>...
#
# Prints one line per migration: "<class> <name> <reasons>".
# Exit codes:
#   0  no class C
#   1  --ci only: a class C migration without the marker comment
#        -- nexa:contract <why it is safe to ship now>
#   3  (without --ci) at least one class C migration, marked or not
#
# The check is a text match on the SQL with `--` comments removed. It is a
# guard, not a parser: a match it gets wrong is fixed by the marker (C) or by
# saying so in the release PR.
# =========================================================
set -euo pipefail

CI_MODE=0
if [ "${1:-}" = "--ci" ]; then
  CI_MODE=1
  shift
fi

# Matched case-insensitively, one statement line at a time.
C_PATTERNS=(
  'DROP[[:space:]]+TABLE'
  'DROP[[:space:]]+COLUMN'
  'DROP[[:space:]]+TYPE'
  '[[:space:]]RENAME[[:space:]]'
  'SET[[:space:]]+NOT[[:space:]]+NULL'
  'ALTER[[:space:]]+COLUMN[[:space:]]+"?[A-Za-z0-9_]+"?[[:space:]]+(SET[[:space:]]+DATA[[:space:]]+)?TYPE'
  'CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?TRIGGER'
  'TRUNCATE'
)
REVIEW_PATTERNS=(
  '^[[:space:]]*UPDATE[[:space:]]'
  'DELETE[[:space:]]+FROM'
  'DROP[[:space:]]+INDEX'
  'DROP[[:space:]]+CONSTRAINT'
)

has_c=0
unmarked_c=0

for arg in "$@"; do
  if [ -d "$arg" ]; then
    file="$arg/migration.sql"
  else
    file="$arg"
  fi
  if [ ! -f "$file" ]; then
    # Can't be read, so it can't be shown safe: counts as C.
    echo "C $(basename "$(dirname "$file")") migration.sql not found"
    has_c=1
    unmarked_c=1
    continue
  fi
  name=$(basename "$(dirname "$file")")

  # Statement text without `--` comments.
  sql=$(sed -e 's/--.*$//' "$file")
  reasons=()
  class=A

  for pattern in "${C_PATTERNS[@]}"; do
    if grep -Eiq -- "$pattern" <<< "$sql"; then
      class=C
      reasons+=("$(grep -Eio -- "$pattern" <<< "$sql" | head -1 | tr -s '[:space:]' ' ' | sed 's/^ //')")
    fi
  done
  # A new NOT NULL column without a default: old code's inserts fail.
  if grep -Ei 'ADD[[:space:]]+COLUMN' <<< "$sql" | grep -Ei 'NOT[[:space:]]+NULL' | grep -Eivq 'DEFAULT'; then
    class=C
    reasons+=("ADD COLUMN NOT NULL without DEFAULT")
  fi
  if [ "$class" = A ] && grep -Eiq 'ADD[[:space:]]+VALUE' <<< "$sql"; then
    class=B
    reasons+=("ADD VALUE")
  fi
  for pattern in "${REVIEW_PATTERNS[@]}"; do
    if grep -Eiq -- "$pattern" <<< "$sql"; then
      reasons+=("review: $(grep -Eio -- "$pattern" <<< "$sql" | head -1 | tr -s '[:space:]' ' ' | sed 's/^ //')")
    fi
  done

  marked=""
  if [ "$class" = C ]; then
    has_c=1
    if grep -q -- '-- nexa:contract' "$file"; then
      marked=" (marked nexa:contract)"
    else
      unmarked_c=1
    fi
  fi
  echo "$class $name$marked ${reasons[*]:-}"
done

if [ "$CI_MODE" = 1 ]; then
  if [ "$unmarked_c" = 1 ]; then
    echo ""
    echo "A class C migration needs the marker comment '-- nexa:contract <reason>'"
    echo "and must ship one release after the code stopped using the old shape."
    echo "See docs/DEPLOY_ROLLBACK_HARDENING.md § \"Rollback classes\"."
    exit 1
  fi
  exit 0
fi
[ "$has_c" = 1 ] && exit 3
exit 0
