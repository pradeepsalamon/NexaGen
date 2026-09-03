#!/usr/bin/env bash
# Extraction + validation of an agent's result JSON against result-schema.json.
# Not every CLI can enforce a schema (only agy has --json-schema), so agents that
# can't are validated -- and lightly repaired -- here.
# Usage: validate-result.sh <result-file> <role>
set -euo pipefail

RESULT="$1"; ROLE="${2:-}"

fail() { echo "RESULT INVALID: $*" >&2; exit 91; }

[ -f "$RESULT" ] || fail "agent wrote no result file at $RESULT"

# --- extraction: tolerate markdown fences or surrounding prose -----------------
if ! jq -e . "$RESULT" >/dev/null 2>&1; then
  tmp="$(mktemp)"
  # strip ```json fences, then take the outermost {...} span
  sed -e 's/^[[:space:]]*```[a-zA-Z]*[[:space:]]*$//' "$RESULT" \
    | awk 'BEGIN{d=0;s=0} {
        line=$0; out=""
        for(i=1;i<=length(line);i++){c=substr(line,i,1)
          if(c=="{"){if(d==0)s=1; d++}
          if(s==1)out=out c
          if(c=="}"){d--; if(d==0&&s==1){print out; exit}}}
        if(s==1)print out
      }' > "$tmp" || true
  if jq -e . "$tmp" >/dev/null 2>&1; then
    mv "$tmp" "$RESULT"
    echo "validate: recovered JSON from non-strict agent output" >&2
  else
    rm -f "$tmp"
    fail "result file is not valid JSON and could not be recovered"
  fi
fi

# --- required fields ----------------------------------------------------------
jq -e 'has("status") and has("diff_summary") and has("files_changed") and has("notes")' \
  "$RESULT" >/dev/null 2>&1 || fail "missing one of: status, diff_summary, files_changed, notes"

STATUS="$(jq -r '.status' "$RESULT")"
case "$STATUS" in
  done|blocked) ;;
  *) fail "status must be 'done' or 'blocked', got '$STATUS'" ;;
esac

jq -e '.files_changed | type == "array"' "$RESULT" >/dev/null 2>&1 \
  || fail "files_changed must be an array"

# --- commit_sha rules ---------------------------------------------------------
SHA="$(jq -r '.commit_sha // "null"' "$RESULT")"
if [ "$STATUS" = "done" ] && [ "$SHA" = "null" ]; then
  # testers and reviewers legitimately commit nothing
  case "$ROLE" in
    tester-e2e|reviewer) ;;
    *) fail "status 'done' from role '$ROLE' requires a commit_sha" ;;
  esac
fi
if [ "$SHA" != "null" ] && ! git -C /opt/nexa-chess/NexaGen-dev cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  fail "commit_sha '$SHA' does not exist in the repository"
fi

# --- role-specific: tester must produce a real report -------------------------
if [ "$ROLE" = "tester-e2e" ] && [ "$STATUS" = "done" ]; then
  jq -e '.test_report and (.test_report.pass|type=="boolean") and (.test_report.failures|type=="array")' \
    "$RESULT" >/dev/null 2>&1 || fail "tester-e2e result needs test_report{pass:bool, failures:[]}"
  if jq -e '.test_report.pass == false and (.test_report.failures|length) == 0' "$RESULT" >/dev/null 2>&1; then
    fail "tester reported pass=false with zero failures -- contradictory report"
  fi
fi

echo "validate: OK (status=$STATUS role=$ROLE)" >&2
