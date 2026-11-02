#!/usr/bin/env bash
# Round-2 probe for #466/#486: eval the REAL extraction block lifted verbatim
# from scripts/ci/close-linked-issues.sh and report, per body, the final
# `numbers` (what would be closed) and the raw `negated` set.
#
# Read-only w.r.t. the repo: no API calls, no PATCH, no suite.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="${1:-$ROOT/scripts/ci/close-linked-issues.sh}"

BLOCK="$(sed -n '/^CLOSE_VERBS=/,/^if \[ -z "\$numbers" \]/p' "$TARGET" | sed '$d')"
if [ -z "$BLOCK" ]; then echo "FATAL: could not lift the extraction block" >&2; exit 90; fi

summarize() { :; }

extract() { # body -> "closed=[..] negated=[..]"
  local PR_BODY="$1"
  eval "$BLOCK" >/dev/null 2>&1
  printf '%s|%s' \
    "$(printf '%s' "$numbers" | tr '\n' ' ' | sed 's/ $//')" \
    "$(printf '%s' "$negated" | tr '\n' ' ' | sed 's/ $//')"
}

run_cases() {
  local mism=0
  while IFS='|' read -r label expect body; do
    [ -z "${label:-}" ] && continue
    local got closed verdict
    got="$(extract "$(printf '%b' "$body")")"
    closed="${got%%|*}"
    verdict=OK
    [ "$closed" = "${expect/none/}" ] || { verdict="MISMATCH(expected $expect)"; mism=$((mism + 1)); }
    printf '%-58s closed=[%s] negated=[%s] %s\n' \
      "$label" "$closed" "${got##*|}" "$verdict"
  done
  return $mism
}

RC=0

echo "### GROUP 1 — round-2 finding 1: not-only must not eat a real negation ###"
run_cases <<'C1' || RC=1
F1a not only does not fix #443|none|This not only does not fix #443, it makes it worse.
F1b not only doesn't fix #443|none|This not only doesn't fix #443, it makes it worse.
F1c control: same bodies + Closes #444|444|This not only does not fix #443, it makes it worse. Closes #444.
F1d control: same bodies + Closes #444|444|This not only doesn't fix #443, it makes it worse. Closes #444.
F1e not only IS affirmative|448 449|This not only fixes #448, it Closes #449.
F1f ... and the second close stands|448 449|This not only fixes #448, it Closes #449.
C1

echo
echo "### GROUP 2 — finding 2: negative contractions, both spellings ###"
run_cases <<'C2' || RC=1
F2a hasn't fixed #443|none|This hasn't fixed #443 yet.
F2b has not fixed #443|none|This has not fixed #443 yet.
F2c haven't resolved #443|none|We haven't resolved #443 yet.
F2d have not resolved #443|none|We have not resolved #443 yet.
F2e hadn't fixed #443|none|The patch hadn't fixed #443.
F2f control: contraction body + Closes #444|444|This hasn't fixed #443 yet. Closes #444.
C2

echo
echo "### GROUP 3 — finding 3: markdown emphasis must not defeat the [no] word test ###"
run_cases <<'C3' || RC=1
F3a no **intention** of closing #443|none|We have no **intention** of closing #443.
F3b no intention of closing #443 (plain)|none|We have no intention of closing #443.
F3c control: same body + Closes #444|444|We have no **intention** of closing #443. Closes #444.
F3d Nobody is not a negator (must close)|459|Nobody closes #459, it is still open.
F3e No, this Closes #N (must close)|457|No, this Closes #457.
F3f No, this does not close #N|none|No, this does not close #460.
C3

echo
echo "### GROUP 4 — finding 4: emphasis inside the AFFIRMATIVE idiom ###"
run_cases <<'C4' || RC=1
F4a not **only** fixes #443 (must close)|443|This not **only** fixes #443, it also improves performance.
F4b not __only__ fixes #443 (must close)|443|This not __only__ fixes #443 too.
F4c control: same body + a real negation|501|This not **only** fixes #501, it also improves performance. It does not fix #502.
F4d control: the real negation in that body|501|This not **only** fixes #501, it also improves performance. It does not fix #502.
C4

echo
echo "### GROUP 5 — #486: sentence scope, both directions ###"
run_cases <<'C5' || RC=1
S1 negator in an earlier sentence (must close)|503|Neither reviewer objected. Closes #503.
S2 negator 4+ words out, same sentence|none|This does not, in any way whatsoever, close #504.
S3 control: same body + Closes #505|505|This does not, in any way whatsoever, close #504. Closes #505.
S4 Do not merge until it Closes #N (#486 trade, logged drop)|none|Do not merge this until it Closes #135.
S5 negation, padded, same sentence|none|This does not even come close to closing #447.
S6 negator, punctuation, same sentence|none|This does not, however, close #444.
C5

echo
echo "### GROUP 6 — regressions the sentence scope must NOT introduce ###"
run_cases <<'C6' || RC=1
R1 negated #A, affirmative #B in one sentence|132|This does not close #131, but Closes #132.
R2 negated and closed same number (tie-break)|none|Closes #456, though this does not close #456.
R3 nor-clause, second ref negated|233|This does not close #231, nor does it fix #232. Closes #233.
R4 neither/nor both negated + control|480|Neither fixes #473 nor closes #474. Closes #480.
R5 not only/just idiom still affirmative|462|This doesn't just fix #462, it closes it.
R6 uppercase keyword|463|CLOSES #463
R7 emphasis around keyword/reference|450|The constraint is satisfied. **Closes** #450.
R8 no-space colon separator|481|Closes:#481
R9 mid-word 'unresolved' extracts nothing|none|This PR is unresolved #108 related work
R10 'Note:'/None: no negator|458|Note: this Closes #458.
R11 bare mention never closes|none|Follow-up wiring is tracked in #123.
R12 Part of #N never closes|none|Part of #121 - the extraction lands in a follow-up PR.
C6

echo
echo "PROBE_RC=$RC"
exit $RC
