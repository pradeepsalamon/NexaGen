#!/usr/bin/env bash
# Decides how much of a Jest suite CI runs. Prints the extra Jest args:
#   --changedSince=<base>  only specs that import a changed file (Jest follows the import graph)
#   (nothing)              the full suite
# Usage: jest-scope.sh <base-sha>   (empty / all-zero / unknown base => full suite)
set -uo pipefail

base="${1:-}"

if [ -z "$base" ] || [ "$base" = "0000000000000000000000000000000000000000" ] \
  || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "No usable base commit; running the full suite." >&2
  exit 0
fi

# Changes the import graph can't see: shared packages resolve through node_modules
# (Jest ignores it), migrations/schema aren't imported, and test config/helpers or
# dependencies affect every spec. Three dots = since the merge base, the same
# range --changedSince covers; a failed diff must not pass for "nothing changed".
if ! changed=$(git diff --name-only "${base}...HEAD"); then
  echo "git diff against ${base} failed; running the full suite." >&2
  exit 0
fi
if printf '%s\n' "$changed" | grep -qE \
  '^(packages/|prisma/|apps/api/prisma/|apps/api/src/test/|apps/api/(jest[^/]*|tsconfig[^/]*|package)\.(ts|json)$|package(-lock)?\.json$|turbo\.json$|\.github/workflows/)'; then
  echo "Shared packages, schema, test setup or dependencies changed; running the full suite." >&2
  exit 0
fi

echo "Running only specs affected by changes since ${base}." >&2
echo "--changedSince=${base}"
