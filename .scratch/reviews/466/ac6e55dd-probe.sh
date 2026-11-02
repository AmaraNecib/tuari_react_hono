#!/usr/bin/env bash
# Round-4 probe for ac6e55dd (#466): eval the REAL extraction block lifted
# verbatim from scripts/ci/close-linked-issues.sh and report, per body, the
# final `numbers` (what would be closed) and the raw `negated` set.
#
# Read-only w.r.t. the repo: no API calls, no PATCH, no suite.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="${1:-$ROOT/scripts/ci/close-linked-issues.sh}"

# Block = CLOSE_VERBS .. the final numeric sanitize of `numbers`.
BLOCK="$(sed -n '/^CLOSE_VERBS=/,/^if \[ -z "\$numbers" \]/p' "$TARGET" | sed '$d')"
if [ -z "$BLOCK" ]; then echo "FATAL: could not lift the extraction block" >&2; exit 90; fi
echo "### lifted block (tail) ###"
printf '%s\n' "$BLOCK" | tail -n 6
echo

extract() { # body -> "closed=[..] negated=[..]"
  local PR_BODY="$1"
  eval "$BLOCK" >/dev/null 2>&1
  printf '%s|%s' \
    "$(printf '%s' "$numbers" | tr '\n' ' ' | sed 's/ $//')" \
    "$(printf '%s' "$negated" | tr '\n' ' ' | sed 's/ $//')"
}

run_cases() {
  while IFS='|' read -r label expect body; do
    [ -z "${label:-}" ] && continue
    local got closed verdict
    got="$(extract "$(printf '%b' "$body")")"
    closed="${got%%|*}"
    verdict=OK
    [ "$closed" = "${expect/none/}" ] || verdict="MISMATCH(expected $expect)"
    printf '%-52s closed=[%s] negated=[%s] %s\n' \
      "$label" "$closed" "${got##*|}" "$verdict"
  done
}

echo "### TASK GROUP 1 — nor/neither clause (round-3 finding) ###"
run_cases <<'C1'
N1 nor-clause 1st ref|none|This does not close #231, nor does it fix #232.
N2 nor-clause 2nd ref|none|This does not close #231, nor does it fix #232.
N3 never ... nor 1st ref|none|No, this never fixes #239 nor closes #240.
N4 never ... nor 2nd ref|none|No, this never fixes #239 nor closes #240.
N5 nor body + affirmative Closes|233|This does not close #231, nor does it fix #232. Closes #233.
N6 neither ... nor (both refs)|none|Neither fixes #473 nor closes #474.
N7 neither X nor Y fixes #N (true negation)|none|Neither the docs nor the code fixes #248.
N8 nor-led sentence|none|Nor does this fix #233.
N9 nor + resolve 2nd ref|none|This does not close #231, nor does it resolve #472.
C1

echo
echo "### TASK GROUP 2 — round-2 blocker repros ###"
run_cases <<'C2'
B1 No, this does not close #150.|none|No, this does not close #150.
B2 No, it doesn't fix #150.|none|No, it doesn't fix #150.
B3 No, we never close #150.|none|No, we never close #150.
B4 No, this Closes #457 (must close)|457|No, this Closes #457.
B5 Note: this Closes #458 (must close)|458|Note: this Closes #458.
B6 Nobody closes #459 (decided: closes)|459|Nobody closes #459, it is still open.
B7 4-word control (must close)|135|Do not merge this until it Closes #135.
B8 not only ... it Closes (both close)|448 449|This not only fixes #448, it Closes #449.
C2

echo
echo "### TASK GROUP 3 — FALSE-CLOSE HUNT: negator families ###"
run_cases <<'C3'
H1 without closing #243 (negation?)|none|Without closing #243 the bug persists.
H2 unable to close #253 (negation?)|none|We were unable to close #253 here.
H3 failed to close #254 (negation?)|none|This failed to close #254.
H4 reverts the PR that closed #224 (narration?)|none|This reverts the PR that closed #224 prematurely.
H5 Nothing closes #245 (negation?)|none|Nothing closes #245.
H6 No one closes #246 (negation?)|none|No one closes #246.
H7 unless we close #261 (negation?)|none|Unless we close #261, the bug stays.
H8 n/a - affirmative control|262|This closes #262 only after merging.
H9 not yet: does not close #250 yet|none|This does not close #250 yet.
H10 not yet: Not closing #251 yet|none|Not closing #251 yet.
H11 do not close #260 (imperative)|none|Do not close #260.
H12 no way this closes #234|none|There is no way this closes #234.
H13 never again closes #273|none|We will never again close #273.
H14 nor 2nd ref, 4 intervening words|none|This does not close #231, nor does it attempt to fix #232.
H15 neither ... nor, 4 words|none|Neither closes #473 nor does it attempt to fix #474.
H16 nor, 3 words + punctuation|none|This does not close #231, nor, at this time, does it fix #232.
H17 nor, long clause|none|This does not close #231, nor does the reviewer believe it will fix #232.
H18 does not, in any way whatsoever, close|none|This does not, in any way whatsoever, close #280.
H19 cannot be done without closing #267|none|The change cannot land without closing #267.
H20 closes after a comma nor-clause|233|Closes #233, and it does not close #231.
C3

echo
echo "### TASK GROUP 4 — FALSE-DROP HUNT (medium at worst) ###"
run_cases <<'C4'
D1 neither ... ; Closes (unrelated clause)|249|This is neither large nor risky. Closes #249.
D2 Neither X. Closes|259|Neither reviewer objected. Closes #259.
D3 not in one clause, Closes in next|269|This does not touch the API; Closes #269.
D4 does not matter; Closes|270|It does not matter; Closes #270.
D5 no follow-up needed. Closes|236|No follow-up needed. Closes #236.
D6 caveat: does not address docs. Closes|271|Caveat: this does not address the docs. Closes #271.
D7 never touches it. Closes|272|The issue is open; this never touches it. Closes #272.
D8 double negation (should close)|247|This does not fail to close #247.
D9 do not forget to close (should close)|249|Do not forget to close #249 before merge.
C4
