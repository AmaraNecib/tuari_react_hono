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
  # Summary files are APPENDED to by the script, so a stale one would let a
  # grep-based assertion pass on a row this scenario never wrote.
  rm -f "$TMP"/summary*.md
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

# #486 turned this case from a close into a LOGGED, RECOVERABLE drop: the
# negator and the close verb now share a sentence, and "Do not merge" must
# never close anything. The drop is echoed so a human can close it by hand.
reset_state
mk_issue 135 open "negator in the same sentence as the close"
run_script "Do not merge this until it Closes #135."
assert_not_closed "'Do not merge this until it Closes #N' is a documented drop (#135, #486 trade)" 135
assert_has "$OUT" "Ignoring #135" "the documented drop is logged so it can be recovered by hand"

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

# Anti-vacuity control for the nor block (round-3 test-audit finding): an
# affirmative reference in the same body still closes, and the run exits 0.
reset_state
mk_issue 480 open "affirmative beside a nor-clause"
run_script "This does not close #471, nor does it resolve #472. Closes #480."
check "nor-clause run exits 0" "0" "$RC"
assert_closed "the affirmative reference beside a nor-clause still closes (#480)" 480

# The no-space colon separator is a closing form (was unpinned at ac6e55dd).
reset_state
mk_issue 481 open "no-space colon separator"
run_script "Closes:#481"
assert_closed "'Closes:#N' closes" 481

# Documented conservative tie-break: one number, negated and closed.
reset_state
mk_issue 456 open "negated and closed"
run_script "Closes #456, though this does not close #456."
assert_not_closed "a body that both negates and closes one number does not close it" 456

# ── Round-2 Greptile findings (#466 → #486: sentence-scoped negation) ───
# The three-word negation window was zero-sum, so the fix is structural:
# negation is scoped to a sentence (terminated by . ! ? ;), and the
# affirmative "not only" idiom is filtered per matched span. Every block
# below pairs a must-NOT-close with a must-close in the SAME body, so an
# affirmative regression cannot leave the block vacuously green.

# Finding 1: the affirmative-idiom filter used to discard the WHOLE matched
# span, so a real negator later in that span vanished and the issue closed.
reset_state
mk_issue 490 open "not-only then a real negation"
mk_issue 491 open "affirmative control in the same body"
run_script "This not only does not fix #490, it makes it worse. Closes #491."
assert_not_closed "'not only does not fix #N' still negates (#490)" 490
assert_closed "the affirmative control in that body closes (#491)" 491

reset_state
mk_issue 492 open "not-only then a contraction negation"
mk_issue 493 open "affirmative control in the same body"
run_script "This not only doesn't fix #492, it makes it worse. Closes #493."
assert_not_closed "'not only doesn't fix #N' still negates (#492)" 492
assert_closed "the affirmative control in that body closes (#493)" 493

# Finding 2: negative contractions. Both spellings must agree.
reset_state
mk_issue 494 open "hasn't spelling"
mk_issue 495 open "has not spelling"
mk_issue 496 open "affirmative control in the same body"
run_script "This hasn't fixed #494 yet, and it has not fixed #495 yet. Closes #496."
assert_not_closed "\"hasn't fixed #N\" never closes (#494)" 494
assert_not_closed "'has not fixed #N' never closes (#495)" 495
assert_closed "the affirmative control in that body closes (#496)" 496

reset_state
mk_issue 497 open "haven't spelling"
mk_issue 498 open "affirmative control in the same body"
run_script "We haven't resolved #497 yet. Closes #498."
assert_not_closed "\"haven't resolved #N\" never closes (#497)" 497
assert_closed "the affirmative control in that body closes (#498)" 498

# Finding 3: markdown emphasis must not defeat the whole-word test on `no`.
reset_state
mk_issue 499 open "no with markdown emphasis"
mk_issue 500 open "affirmative control in the same body"
run_script "We have no **intention** of closing #499. Closes #500."
assert_not_closed "'no **intention** of closing #N' never closes (#499)" 499
assert_closed "the affirmative control in that body closes (#500)" 500

# Finding 4: the AFFIRMATIVE idiom must tolerate the same emphasis.
reset_state
mk_issue 501 open "not **only** fixes"
mk_issue 502 open "real negation in the same body"
run_script "This not **only** fixes #501, it also improves performance. It does not fix #502."
assert_closed "'not **only** fixes #N' is affirmative (#501)" 501
assert_not_closed "the real negation in that body still negates (#502)" 502

# #486 itself: the sentence scope. A negator in an unrelated sentence used to
# swallow a real close; a negation padded past the old three-word window used
# to let an issue close.
reset_state
mk_issue 503 open "negator in an unrelated sentence"
run_script "Neither reviewer objected. Closes #503."
check "negator-in-an-earlier-sentence run exits 0" "0" "$RC"
assert_closed "a negator in an earlier sentence does not negate a later close (#503)" 503

reset_state
mk_issue 504 open "negation padded past three words"
mk_issue 505 open "affirmative control in the same body"
run_script "This does not, in any way whatsoever, close #504. Closes #505."
assert_not_closed "a negation longer than three words still negates (#504)" 504
assert_closed "the affirmative control in that body closes (#505)" 505

# Finding 5: a negated candidate must appear in the STEP SUMMARY as skipped,
# not just in the run log.
reset_state
jq -cn --arg s open --arg b 'This does not close #507. Closes #508.' \
  '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
mk_issue 507 open "negated summary row"
mk_issue 508 open "affirmative summary row"
SUMF="$TMP/summary-negated.md"
OUT=$(GITHUB_STEP_SUMMARY="$SUMF" PR_NUMBER=42 PR_BODY="This does not close #507. Closes #508." bash "$TARGET" 2>&1); RC=$?
check "negated-summary run exits 0" "0" "$RC"
assert_not_closed "the negated candidate in that body does not close (#507)" 507
assert_closed "the affirmative candidate in that body closes (#508)" 508
if grep -qE 'SKIP.*#507.*negates closing it' "$SUMF" && grep -q 'CLOSED.*#508' "$SUMF"; then
  check "a negated candidate is reported as skipped with its reason in the step summary" yes yes
else
  check "a negated candidate is reported as skipped with its reason in the step summary" yes no
fi

# A body whose ONLY candidate is negated leaves `numbers` empty: the script
# takes the empty-numbers early exit and still has to write the SKIP row
# through the EXIT trap. Without a summary file that path was untested.
reset_state
jq -cn --arg s open --arg b 'This does not close #509.' \
  '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
mk_issue 509 open "negated-only body"
SUMF="$TMP/summary-negated-only.md"
OUT=$(GITHUB_STEP_SUMMARY="$SUMF" PR_NUMBER=42 PR_BODY="This does not close #509." bash "$TARGET" 2>&1); RC=$?
check "negated-only run exits 0" "0" "$RC"
assert_not_closed "a negated-only body closes nothing (#509)" 509
if grep -qE 'SKIP.*#509.*negates closing it' "$SUMF" && grep -q 'nothing to close' <<<"$OUT"; then
  check "a negated-only body still reports its SKIP row and takes the empty-numbers exit" yes yes
else
  check "a negated-only body still reports its SKIP row and takes the empty-numbers exit" yes no
fi

# ── Round-2 gate findings (fix on top of bfe4c50d) ──────────────────────
# A `.`/`!`/`?`/`;` INSIDE a token is not a sentence end. Splitting on it moved
# the negator into a different "sentence" from its verb and turned a drop into
# a CLOSE — the wrong-close direction, and a regression against the parent
# commit. The boundary is now "terminator + whitespace + a non-lowercase", so
# each block below pairs the must-NOT-close with a same-body must-close.
reset_state
mk_issue 510 open "dot inside a filename between negator and verb"
mk_issue 511 open "affirmative control in the same body"
run_script "This does not, per AGENTS.md, close #510. Closes #511."
assert_not_closed "a '.' inside a filename is not a sentence end (#510)" 510
assert_closed "the affirmative control in that body closes (#511)" 511

reset_state
mk_issue 512 open "abbreviation between negator and verb"
mk_issue 513 open "ellipsis between negator and verb"
mk_issue 514 open "affirmative control in the same body"
run_script "This does not e.g. fix #512, and it does not... close #513. Closes #514."
assert_not_closed "'e.g.' between negator and verb still negates (#512)" 512
assert_not_closed "an ellipsis between negator and verb still negates (#513)" 513
assert_closed "the affirmative control in that body closes (#514)" 514

reset_state
mk_issue 515 open "version number between negator and verb"
mk_issue 516 open "affirmative control in the same body"
run_script "This does not (see v1.2) fix #515. Closes #516."
assert_not_closed "a version number between negator and verb still negates (#515)" 515
assert_closed "the affirmative control in that body closes (#516)" 516

# The other three terminators are load-bearing too: `!`, `?` and `;` end a
# sentence, so a negation cannot reach across them.
reset_state
mk_issue 517 open "negator before a '?' terminator"
mk_issue 518 open "negator before a '!' terminator"
run_script "Did you not read the issue? Closes #517. It was not fixed! Closes #518."
assert_closed "a '?' ends the sentence, so the later close stands (#517)" 517
assert_closed "a '!' ends the sentence, so the later close stands (#518)" 518

reset_state
mk_issue 519 open "negator before a ';' terminator"
run_script "The change is not related; Closes #519."
check "';' terminator run exits 0" "0" "$RC"
assert_closed "a ';' ends the sentence, so the later close stands (#519)" 519

reset_state
mk_issue 520 open "negation after a ';'"
mk_issue 521 open "affirmative control in the same body"
run_script "The change is not related; this does not close #520. Closes #521."
assert_not_closed "a lowercase clause after the ';' is one sentence, and its negation still negates (#520)" 520
assert_closed "the affirmative control in that body closes (#521)" 521

# The guard is about the character after the whole whitespace RUN: a second
# space is not a sentence start, so the two-space form must negate exactly like
# the one-space form. CRLF bodies go through the same join-then-guard path.
reset_state
mk_issue 522 open "double space after the terminator"
mk_issue 523 open "affirmative control in the same body"
run_script "This does not fix the parser.  closes #522. Closes #523."
assert_not_closed "a double space after the terminator is not a sentence break (#522)" 522
assert_closed "the affirmative control in that body closes (#523)" 523

reset_state
mk_issue 524 open "CRLF body, negated first sentence"
mk_issue 525 open "CRLF body, affirmative second sentence"
run_script $'This does not close #524.\r\nCloses #525.'
check "CRLF body exits 0" "0" "$RC"
assert_not_closed "a CRLF body keeps the negated reference negated (#524)" 524
assert_closed "a CRLF body still fires the affirmative close (#525)" 525

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

# ... and a FAILED body fetch still fails open with an empty body.
reset_state
mkdir -p "$TMP/issues"
echo 42 >"$TMP/fail_subs"
OUT=$(PR_NUMBER=42 bash "$TARGET" 2>&1); RC=$?
check "PR_BODY fetch failure exits 0" "0" "$RC"
assert_has "$OUT" "nothing to close" "a failed PR_BODY fetch degrades to an empty body"

# An empty body is a no-op, not a crash.
reset_state
mk_issue 118 open "empty-body target"
run_script ""
check "empty body exits 0" "0" "$RC"
assert_has "$OUT" "nothing to close" "an empty body takes the nothing-to-close path"
assert_not_closed "an empty body closes nothing" 118

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