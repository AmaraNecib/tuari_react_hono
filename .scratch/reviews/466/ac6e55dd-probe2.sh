#!/usr/bin/env bash
# Round-4 probe, part 2: the false-drop hunt (group 4) that got cut off by the
# 120s wall clock of the first run. Same lifted extraction block.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="${1:-$ROOT/scripts/ci/close-linked-issues.sh}"
BLOCK="$(sed -n '/^CLOSE_VERBS=/,/^if \[ -z "\$numbers" \]/p' "$TARGET" | sed '$d')"

extract() {
  local PR_BODY="$1"
  eval "$BLOCK" >/dev/null 2>&1
  printf '%s|%s' \
    "$(printf '%s' "$numbers" | tr '\n' ' ' | sed 's/ $//')" \
    "$(printf '%s' "$negated" | tr '\n' ' ' | sed 's/ $//')"
}

while IFS='|' read -r label expect body; do
  [ -z "${label:-}" ] && continue
  got="$(extract "$(printf '%b' "$body")")"
  closed="${got%%|*}"
  verdict=OK
  [ "$closed" = "${expect/none/}" ] || verdict="MISMATCH(expected $expect)"
  printf '%-52s closed=[%s] negated=[%s] %s\n' "$label" "$closed" "${got##*|}" "$verdict"
done <<'C4'
D3 not in one clause, Closes in next|269|This does not touch the API; Closes #269.
D4 does not matter; Closes|270|It does not matter; Closes #270.
D5 no follow-up needed. Closes|236|No follow-up needed. Closes #236.
D6 caveat: does not address docs. Closes|271|Caveat: this does not address the docs. Closes #271.
D7 never touches it. Closes|272|The issue is open; this never touches it. Closes #272.
D8 double negation (should close)|247|This does not fail to close #247.
D9 do not forget to close (should close)|249|Do not forget to close #249 before merge.
D10 nor-clause then affirmative, separate sentence|233|This does not close #231 nor does it fix #232. Closes #233.
C4
