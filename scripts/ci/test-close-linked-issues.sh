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

# ── #466: only a real closing keyword, directly before the reference ─────
# Before the fix the matcher allowed any gap (`[^#]*`) between keyword and
# reference, so these mention forms closed issues that were never delivered.
reset_state
mk_issue 120 open "announced follow-up"
run_script "A related finding is filed as #120 — it is not delivered here."
check "mention-only run exits 0" "0" "$RC"
assert_not_closed "'filed as #N' never closes" 120

reset_state
mk_issue 121 open "partial delivery"
run_script "Part of #121 — the extraction lands in a follow-up PR."
assert_not_closed "'Part of #N' never closes" 121

reset_state
mk_issue 122 open "prose gap (#442 regression)"
run_script "The review found and fixed a shared control, and a separate empty-state issue is filed as #122."
assert_not_closed "prose keyword far from the reference never closes (#442 regression)" 122

reset_state
mk_issue 1220 open "short prose gap"
run_script "This PR documents the fix for #1220 in the changelog."
assert_not_closed "prose 'the fix for #N' never closes" 1220

reset_state
mk_issue 123 open "bare mention"
run_script "Follow-up wiring is tracked in #123."
assert_not_closed "bare '#N' mention never closes" 123

reset_state
mk_issue 124 open "real close"
run_script "Closes #124"
assert_closed "'Closes #N' closes" 124

reset_state
mk_issue 125 open "real fix close"
run_script "Fixes #125"
assert_closed "'Fixes #N' closes" 125

reset_state
mk_issue 126 open "colon form"
run_script "Resolves: #126"
assert_closed "'Resolves: #N' closes" 126

# Titles are never consulted: the workflow passes the PR BODY only and the API
# fetch reads `.body`, so a closing keyword in the TITLE must close nothing.
reset_state
mk_issue 127 open "title-only close target"
jq -cn --arg s open --arg b 'No closing keywords in this body.' \
  --arg t 'Closes #127' \
  '{state:$s, body:$b, title:$t, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
OUT=$(PR_NUMBER=42 bash "$TARGET" 2>&1); RC=$?
check "title-only run exits 0" "0" "$RC"
assert_not_closed "a closing keyword in the PR TITLE never closes" 127

# A negated close is not a close (parent decision on #466).
reset_state
mk_issue 128 open "negated close"
run_script "This does not close #128 — the work is still open."
check "negated run exits 0" "0" "$RC"
assert_not_closed "'does not close #N' never closes" 128
assert_has "$OUT" "Ignoring #128" "negation is echoed"

reset_state
mk_issue 129 open "negated resolve"
run_script "The shared primitive does not resolve #129 on its own."
assert_not_closed "'does not resolve #N' never closes" 129

reset_state
mk_issue 130 open "negated fix (never)"
run_script "Refactoring the hook never fixes #130."
assert_not_closed "'never fixes #N' never closes" 130

reset_state
mk_issue 131 open "negated on one side"
mk_issue 132 open "affirmative on the other side"
run_script "This does not close #131, but Closes #132."
assert_not_closed "the negated reference in a mixed body is dropped (#131)" 131
assert_closed "the affirmative reference in the same body still closes (#132)" 132

reset_state
mk_issue 133 open "affirmative then negated"
mk_issue 134 open "negated second"
run_script "Closes #133. It does not fix #134."
assert_closed "a leading affirmative close still fires (#133)" 133
assert_not_closed "a trailing negated close does not (#134)" 134

reset_state
mk_issue 135 open "negator in a different clause"
run_script "Do not merge this until it Closes #135."
assert_closed "a negator four words from the keyword is a different clause (#135)" 135

# ── Findings from the f64292ec review round ─────────────────────────────
# C1: punctuation between negator and keyword defeated the negation pass.
reset_state
mk_issue 444 open "negation with punctuation"
run_script "This does not, however, close #444."
assert_not_closed "'does not, however, close #N' never closes" 444

reset_state
mk_issue 445 open "negation via intention"
run_script "We have no intention of closing #445."
assert_not_closed "'no intention of closing #N' never closes" 445

reset_state
mk_issue 446 open "negation three words out"
run_script "This does not, in any way, close #446."
assert_not_closed "a three-word negator gap still negates (#446)" 446

# The negation pass cannot span a line break unless newlines are joined first.
reset_state
mk_issue 447 open "negation across a line break"
run_script "This does not
close #447."
assert_not_closed "a negated close split across two lines never closes" 447

# C2: "not only/just" is affirmative — it must not be subtracted.
reset_state
mk_issue 448 open "affirmative not-only"
mk_issue 449 open "affirmative same body"
run_script "This not only fixes #448, it Closes #449."
assert_closed "'not only fixes #N' is affirmative and closes (#448)" 448
assert_closed "the second close in the same body closes (#449)" 449

# C3: markdown emphasis and line breaks around the separator are real closes.
reset_state
mk_issue 450 open "bold keyword"
run_script "The constraint is satisfied. **Closes** #450."
assert_closed "'**Closes** #N' closes" 450

reset_state
mk_issue 451 open "bold reference"
run_script "Closes **#451**."
assert_closed "'Closes **#N**' closes" 451

reset_state
mk_issue 452 open "keyword on its own line"
run_script "Closes
#452."
assert_closed "'Closes' on one line and '#N' on the next closes" 452

# C4: the subtraction is logged only for a real candidate.
reset_state
mk_issue 454 open "negated and affirmative in one body"
mk_issue 455 open "affirmative"
run_script "This does not close #454. Closes #455."
assert_closed "the affirmative reference closes (#455)" 455
assert_not_closed "the negated reference does not (#454)" 454
assert_has "$OUT" "Ignoring #454" "the subtracted candidate is reported"

# A sentence-opening "No," is not a negated close.
reset_state
mk_issue 457 open "interjection no"
run_script "No, this Closes #457."
assert_closed "a sentence-opening 'No,' does not negate the close (#457)" 457

# ── Findings from the 978cf95b review round ─────────────────────────────
# BLOCKER: the bare-`no` filter swallowed a real negation that followed it.
reset_state
mk_issue 460 open "interjection then a real negation"
run_script "No, this does not close #460."
assert_not_closed "a real negation after 'No,' still negates (#460)" 460

reset_state
mk_issue 470 open "interjection then a contraction negation"
run_script "No, it doesn't fix #470."
assert_not_closed "a contraction negation after 'No,' still negates (#470)" 470

# A negator must be a whole word: these are real closes, not negations.
reset_state
mk_issue 458 open "Note: is not a negator"
run_script "Note: this Closes #458."
assert_closed "'Note:' is not the negator 'not' (#458)" 458

reset_state
mk_issue 459 open "Nobody is not a negator"
run_script "Nobody closes #459, it is still open."
assert_closed "a word starting with 'no' is not a negator, so the close stands (#459)" 459

reset_state
mk_issue 462 open "contraction not-only"
run_script "This doesn't just fix #462, it closes it."
assert_closed "\"doesn't just fix #N\" is affirmative (#462)" 462

# Case-insensitivity and the remaining documented negation spellings.
reset_state
mk_issue 463 open "uppercase keyword"
run_script "CLOSES #463"
assert_closed "case-insensitive 'CLOSES #N' closes" 463

reset_state
mk_issue 464 open "no longer negates"
run_script "This no longer closes #464."
assert_not_closed "'no longer closes #N' never closes" 464

reset_state
mk_issue 465 open "won't negates"
run_script "Won't fix #465 here."
assert_not_closed "\"won't fix #N\" never closes" 465

reset_state
mk_issue 468 open "cannot negates"
run_script "This cannot resolve #468 alone."
assert_not_closed "'cannot resolve #N' never closes" 468

reset_state
mk_issue 469 open "not going to negates"
run_script "We are not going to close #469 in this PR."
assert_not_closed "'not going to close #N' never closes" 469

# Round 3: a second reference in a nor-clause is still negated.
reset_state
mk_issue 471 open "nor clause, first reference"
mk_issue 472 open "nor clause, second reference"
run_script "This does not close #471, nor does it resolve #472."
assert_not_closed "the negated first reference never closes (#471)" 471
assert_not_closed "the nor-clause reference never closes (#472)" 472

reset_state
mk_issue 473 open "neither/nor, first reference"
mk_issue 474 open "neither/nor, second reference"
run_script "Neither fixes #473 nor closes #474."
assert_not_closed "'neither fixes #N' never closes (#473)" 473
assert_not_closed "'nor closes #N' never closes (#474)" 474

# Documented conservative tie-break: one number, negated and closed.
reset_state
mk_issue 456 open "negated and closed"
run_script "Closes #456, though this does not close #456."
assert_not_closed "a body that both negates and closes one number does not close it" 456

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