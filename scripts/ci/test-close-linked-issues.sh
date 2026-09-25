#!/usr/bin/env bash
# Unit tests for scripts/ci/close-linked-issues.sh (issue #54).
#
# Shadows `curl` with a fake on PATH (real jq stays for parsing), then runs a
# scenario matrix against the REAL script. Requires `jq` (present on the repo
# self-hosted runners; install locally, e.g. `winget install jq`).
# Run from anywhere: bash scripts/ci/test-close-linked-issues.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/close-linked-issues.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq not found on PATH — install jq first (this repo's runners have it)."
  exit 2
fi

TMP="$(mktemp -d)"
FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_BIN" "$TMP/issues"
export PATH="$FAKE_BIN:$PATH"
export GH_TOKEN=fake-token
export GH_REPO=owner/repo
export TMP

fake_curl() {
  local method=GET url="" data=""
  local have_dash_x=false
  while [ $# -gt 0 ]; do
    case "$1" in
      -X) shift; method="$1" ;;
      -d) shift; data="$1" ;;
      --) : ;;
      -*) : ;;
      *) [[ "$1" == https://* ]] && url="$1" ;;
    esac
    shift
  done
  local path="${url#https://api.github.com/repos/${GH_REPO}/}"
  case "$method:$path" in
    GET:pulls/*)
      # qualification reads .merged/.base.ref — served from the PR fixture
      local pnum=""
      [[ "$path" =~ pulls/([0-9]+) ]] && pnum="${BASH_REMATCH[1]}"
      cat "$TMP/issues/$pnum.json" 2>/dev/null || printf '%s' '{"merged":false,"base":{"ref":""}}'
      ;;
    GET:issues/*)
      local num=""
      [[ "$path" =~ issues/([0-9]+) ]] && num="${BASH_REMATCH[1]}"
      if [ -f "$TMP/fail_subs" ] && grep -qx "$num" "$TMP/fail_subs" 2>/dev/null; then
        echo "API exploded" >&2; return 1
      fi
      cat "$TMP/issues/$num.json" 2>/dev/null || printf '%s' '{"state":"open","body":""}'
      ;;
    PATCH:issues/*)
      local num=""
      [[ "$path" =~ issues/([0-9]+) ]] && num="${BASH_REMATCH[1]}"
      if [ -f "$TMP/fail_close" ] && grep -qx "$num" "$TMP/fail_close" 2>/dev/null; then
        echo "close failed" >&2; return 1
      fi
      echo closed >"$TMP/closed_$num"
      printf '%s' '{"state":"closed"}'
      ;;
    POST:issues/*/comments)
      echo ok
      ;;
    *)
      echo "unhandled: $method $path" >&2
      return 1
      ;;
  esac
}

cat >"$FAKE_BIN/curl" <<EOF2
#!/usr/bin/env bash
$(declare -f fake_curl)
fake_curl "\$@"
EOF2
chmod +x "$FAKE_BIN/curl"

mk_issue() { # num state body [subs_total subs_done]  — state mirrors REST: lowercase
  local json
  json=$(jq -n --arg s "$2" --arg b "$3" '{state:$s, body:$b}')
  if [ $# -ge 5 ]; then
    json=$(printf '%s' "$json" | jq --argjson t "$4" --argjson d "$5" '.sub_issues_summary = {total:$t, completed:$d}')
  fi
  printf '%s' "$json" >"$TMP/issues/$1.json"
}

run_script() { # pr_body  -> sets OUT and RC  (PR number defaults to 42; merged into develop)
  local prnum="${PRNUM:-42}"
  jq -cn --arg s "open" --arg b "$1" '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/$prnum.json"
  unset PR_BODY DRY_RUN GITHUB_STEP_SUMMARY QUALIFIED
  OUT=$(PR_NUMBER="$prnum" bash "$TARGET" 2>&1)
  RC=$?
}

reset_state() {
  rm -rf "$TMP/issues" "$TMP/fail_close" "$TMP/fail_subs" "$TMP"/closed_* 2>/dev/null
  mkdir -p "$TMP/issues"
  true
}

PASS=0; FAIL=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); echo "PASS: $1"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $1"
    echo "  expected: [$2]"
    echo "  actual:   [$3]"
    echo "  --- output ---"; sed 's/^/  | /' <<<"${OUT:-}"
  fi
}
assert_closed() { check "$1 closed #$2" "yes" "$([ -f "$TMP/closed_$2" ] && echo yes || echo no)"; }
assert_not_closed() { check "$1 did NOT close #$2" "no" "$([ -f "$TMP/closed_$2" ] && echo yes || echo no)"; }
assert_has() { grep -qE "$2" <<<"$1" && check "$3" yes yes || check "$3" yes no; }
assert_not_has() { grep -qE "$2" <<<"$1" && check "$3" no yes || check "$3" no no; }

# ── Scenarios ────────────────────────────────────────────────────────────

reset_state
mk_issue 101 open "plain issue body"
run_script "Closes #101"
check "happy path exits 0" "0" "$RC"
assert_closed "happy path" 101

reset_state
mk_issue 102 closed "done already"
run_script "Closes #102"
assert_not_closed "already-closed skip" 102
check "skip-closed exit still 0" "0" "$RC"
assert_has "$OUT" "SKIP: #102" "skip reason echoed"

reset_state
mk_issue 103 open "parent tracker" 3 1
run_script "Closes #103"
assert_not_closed "parent w/ open sub-issues skipped" 103
assert_has "$OUT" "open sub-issues" "sub-issue reason echoed"

reset_state
mk_issue 104 open "all sub-issues done" 3 3
run_script "Closes #104"
assert_closed "parent w/ all sub-issues done closes" 104

reset_state
mk_issue 105 open "remaining work tracked in #555"
mk_issue 555 open "still open"
run_script "Closes #105"
assert_not_closed "remaining-in-open-issue guard" 105

reset_state
mk_issue 106 open "remaining work tracked in #556 (closed now)"
mk_issue 556 closed "resolved"
run_script "Closes #106"
assert_closed "remaining ref to CLOSED issue does not block" 106

reset_state
mk_issue 201 open "real delivery"
mk_issue 200 open "parent of 201"
run_script "Closes #201 — Part of #200"
assert_closed "lineage marker on OTHER number never blocks (#201)" 201
assert_not_closed "#200 not referenced as a close target" 200

reset_state
mk_issue 107 open "self-marked partial"
run_script "Closes #107 — Part of #107"
assert_not_closed "self-reference partial guard" 107
assert_has "$OUT" "partial/deferred" "self-reference reason echoed"

reset_state
mk_issue 108 open "midword target"
run_script "This PR is unresolved #108 related work"
check "mid-word match extracts nothing (exit 0)" "0" "$RC"
assert_not_closed "mid-word match does not close" 108

reset_state
run_script "no references at all in this body"
check "no refs exits 0" "0" "$RC"

reset_state
mk_issue 109 open "no sub_issues_summary field at all"
run_script "Fixes #109"
assert_closed "sub-issue field absent from response fails open → closes" 109

reset_state
mk_issue 1234 open "API totally down"
echo 1234 >"$TMP/fail_subs"
run_script "Fixes #1234"
check "whole-API failure exits 0 (job survives)" "0" "$RC"
assert_not_closed "whole-API failure skips safely (no wrongful close)" 1234
assert_has "$OUT" "SKIP: #1234 state=unknown" "API-failure reason echoed"

reset_state
mk_issue 110 open "unclosable"
echo 110 >"$TMP/fail_close"
run_script "Resolves #110"
check "close failure warns but exits 0" "0" "$RC"
assert_has "$OUT" "WARN: failed to close #110" "WARN echoed"

reset_state
# A dry run applies the same merge qualification now, so this fixture must carry merged/base.
jq -cn --arg s open --arg b 'Closes #111' '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
mk_issue 111 open "dry run target"
OUT=$(DRY_RUN=1 PR_NUMBER=42 PR_BODY="Closes #111" bash "$TARGET" 2>&1); RC=$?
check "dry run exits 0" "0" "$RC"
assert_not_closed "DRY_RUN never closes" 111
assert_has "$OUT" "WOULD CLOSE #111" "dry run logs intent"

# Parity: a dry run must not promise a close the real path would refuse
reset_state
jq -cn --arg s open --arg b 'Closes #116' '{state:$s, body:$b, merged:false, base:{ref:"develop"}}' >"$TMP/issues/42.json"
mk_issue 116 open "unmerged dry run target"
OUT=$(DRY_RUN=1 PR_NUMBER=42 PR_BODY="Closes #116" bash "$TARGET" 2>&1); RC=$?
check "unmerged dry run exits 0" "0" "$RC"
assert_not_has "$OUT" "WOULD CLOSE #116" "unmerged dry run promises nothing"
assert_has "$OUT" "not merged into develop" "unmerged dry run echoes the refusal reason"

# A real merge event skips the qualification reads entirely (EVENT_QUALIFIED=1)
reset_state
jq -cn --arg s open --arg b 'Closes #117' '{state:$s, body:$b, merged:false, base:{ref:""}}' >"$TMP/issues/42.json"
mk_issue 117 open "merge-event target"
OUT=$(EVENT_QUALIFIED=1 PR_NUMBER=42 PR_BODY="Closes #117" bash "$TARGET" 2>&1); RC=$?
check "merge-event run closes without a qualification read" "0" "$RC"
assert_closed "merge-event run" 117

# Summary file output
reset_state
jq -cn --arg s open --arg b 'Closes #112 Fixes #113' '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
mk_issue 112 open "summary target"
mk_issue 113 closed "summary skip"
SUMF="$TMP/summary.md"
OUT=$(GITHUB_STEP_SUMMARY="$SUMF" PR_NUMBER=42 PR_BODY="Closes #112 Fixes #113" bash "$TARGET" 2>&1); RC=$?
check "summary run exits 0" "0" "$RC"
if grep -q "Auto-close results (PR #42)" "$SUMF" \
  && grep -q "CLOSED.*#112.*delivered by PR #42" "$SUMF" \
  && grep -q "SKIP.*#113" "$SUMF"; then
  check "step summary table written" yes yes
else
  check "step summary table written" yes no
fi

# PR_BODY fetched via API when env var absent (PR number = 77, merged into develop)
reset_state
mkdir -p "$TMP/issues"
mk_issue 114 open "fetch-body target"
jq -cn --arg s open --arg b 'Closes #114' '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/77.json"
OUT=$(PR_NUMBER=77 bash "$TARGET" 2>&1); RC=$?
assert_closed "PR_BODY auto-fetched via API" 114

# Unmerged PR must never close anything, even with dry_run unset
reset_state
mkdir -p "$TMP/issues"
jq -cn --arg s open --arg b 'Closes #115' '{state:$s, body:$b, merged:false, base:{ref:"develop"}}' >"$TMP/issues/42.json"
mk_issue 115 open "must not close"
OUT=$(PR_NUMBER=42 PR_BODY="Closes #115" bash "$TARGET" 2>&1); RC=$?
check "unmerged-PR refusal exits 0" "0" "$RC"
assert_not_closed "unmerged PR: nothing closed" 115
assert_has "$OUT" "not merged into develop" "unmerged refusal reason echoed"

# Missing GH_TOKEN → clean error, no fake-API traffic needed
OUT=$(PR_NUMBER=42 env -u GH_TOKEN bash "$TARGET" 2>&1); RC=$?
check "missing token errors clearly" "1" "$RC"
assert_has "$OUT" "GH_TOKEN is not set" "missing-token message"

echo
echo "════════════════════════════════"
echo "PASS=$PASS FAIL=$FAIL"
rm -rf "$TMP"
[ "$FAIL" -eq 0 ]