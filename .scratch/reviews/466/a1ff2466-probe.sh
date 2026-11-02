#!/usr/bin/env bash
# Round-3 probe for a1ff2466: drives the REAL close-linked-issues.sh with a fake
# curl on PATH (harness shape copied from scripts/ci/test-close-linked-issues.sh)
# and, separately, evals the REAL extraction block lifted verbatim.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="${1:-$ROOT/scripts/ci/close-linked-issues.sh}"
TMP="$(mktemp -d)"; FAKE_BIN="$TMP/bin"; mkdir -p "$FAKE_BIN" "$TMP/issues"
export PATH="$FAKE_BIN:$PATH" GH_TOKEN=fake-token GH_REPO=owner/repo TMP

fake_curl() {
  local method=GET url="" data=""
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
    GET:pulls/*) cat "$TMP"/issues/"${path##*/}".json 2>/dev/null || printf '%s' '{"merged":true,"base":{"ref":"develop"}}' ;;
    GET:issues/*) cat "$TMP"/issues/"${path##*/}".json 2>/dev/null || printf '%s' '{"state":"open","body":""}' ;;
    PATCH:issues/*) echo closed >"$TMP/closed_${path##*/}"; printf '%s' '{"state":"closed"}' ;;
    POST:issues/*/comments) echo ok ;;
    *) echo "unhandled: $method $path" >&2; return 1 ;;
  esac
}
cat >"$FAKE_BIN/curl" <<EOF2
#!/usr/bin/env bash
$(declare -f fake_curl)
fake_curl "\$@"
EOF2
chmod +x "$FAKE_BIN/curl"

mk_issue() { jq -n --arg s open --arg b "$2" '{state:$s, body:$b}' >"$TMP/issues/$1.json"; }

BLOCK=$(sed -n '/^CLOSE_VERBS=/,/^numbers=\$(printf/p' "$TARGET")
extract() {
  PR_BODY="$1"
  eval "$BLOCK" >/dev/null
  printf 'num=[%s] neg=[%s]' "$(printf '%s' "$numbers" | tr '\n' ' ')" "$(printf '%s' "$negated" | tr '\n' ' ')"
}

echo "### EXTRACTOR (verbatim block, lines: CLOSE_VERBS..final filter) ###"
while IFS='|' read -r label body; do
  [ -z "${label:-}" ] && continue
  printf '%-52s %s\n' "$label" "$(extract "$(printf '%b' "$body")")"
done <<'XCASES'
X1 No, this does not close #460.|No, this does not close #460.
X2 No, it doesn't fix #470.|No, it doesn't fix #470.
X3 No, we never close #150.|No, we never close #150.
X4 No, we have decided that this does not close #150.|No, we have decided that this does not close #150.
X5 No, this Closes #457.|No, this Closes #457.
X6 4-word control (must close #135)|Do not merge this until it Closes #135.
X7 does not close #231, nor does it fix #232|This does not close #231, nor does it fix #232.
X8 No, this never fixes #239 nor closes #240.|No, this never fixes #239 nor closes #240.
X9 not just a rename; does not close #225|Not just a rename, it does not close #225.
X10 not only a rename; does not close #226|This is not only a rename; it does not close #226.
X11 not only docs: does not close #227|Not only docs: this does not close #227.
X12 not only <3 words>, does not close #228|Not only does it rename things, it does not close #228.
X13 that word-boundary check: component only|This component only touches docs; Closes #241.
X14 does not just fix #466|This does not just fix #466.
XCASES

for n in 135 150 151 152 153 154 155 156 157 158 159 160 220 221 222 223 224 225 226 227 228 231 232 239 240 241 242 243 244 449 457 458 459 460 461 462 463 464 465 466 467 470; do mk_issue "$n" "fixture"; done

echo; echo "### END-TO-END (real script + fake curl; fake PATCH records closed_<n>) ###"
while IFS='|' read -r label num expect body; do
  [ -z "${label:-}" ] && continue
  rm -f "$TMP"/closed_* 2>/dev/null
  jq -cn --arg s open --arg b "$(printf '%b' "$body")" '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
  OUT=$(EVENT_QUALIFIED=1 PR_NUMBER=42 bash "$TARGET" 2>&1); rc=$?
  got=no; [ -f "$TMP/closed_$num" ] && got=yes
  v=OK; [ "$got" = "$expect" ] || v="MISMATCH"
  printf '%-60s #%-5s expect=%-3s got=%-3s rc=%s %s\n' "$label" "$num" "$expect" "$got" "$rc" "$v"
done <<'ECASES'
BLOCKER No, this does not close #460.|460|no|No, this does not close #460.
BLOCKER No, it doesn't fix #470.|470|no|No, it doesn't fix #470.
BLOCKER No, we never close #150.|150|no|No, we never close #150.
NEG does not close|151|no|This does not close #151.
NEG does not, however, close|152|no|This does not, however, close #152.
NEG no intention of closing|153|no|We have no intention of closing #153.
NEG no longer closes|154|no|This no longer closes #154.
NEG won't fix|155|no|Won't fix #155 here.
NEG cannot resolve|156|no|This cannot resolve #156 alone.
NEG not going to close|157|no|We are not going to close #157 in this PR.
NEG never fixes|158|no|Refactoring the hook never fixes #158.
NEG does not, in any way, close|159|no|This does not, in any way, close #159.
AFF Closes|160|yes|Closes #160
AFF **Closes**|461|yes|**Closes** #461
AFF Closes **#N**|462|yes|Closes **#462**
AFF CLOSES|463|yes|CLOSES #463
AFF Closes\n#N|464|yes|Closes\n#464
AFF Not only fixes|465|yes|This not only fixes #465 and more.
AFF doesn't just fix|466|yes|This doesn't just fix #466 — it rewrites it.
AFF Note: this Closes|458|yes|Note: this Closes #458.
AFF No, this Closes|457|yes|No, this Closes #457.
AFF Do not merge this until it Closes (4w)|135|yes|Do not merge this until it Closes #135.
AFF Nobody closes|459|yes|Nobody closes #459, it is still open.
AFF not only fixes + Closes|467|yes|This not only fixes #467, it Closes #449.
AFF (2nd number same body)|449|yes|This not only fixes #467, it Closes #449.
MENTION filed as #N|220|no|A related finding is filed as #220 — it is not delivered here.
MENTION Part of #N|221|no|Part of #221 — landing later.
MENTION tracked in #N|222|no|Follow-up wiring is tracked in #222.
HUNT Not just a rename, does not close|225|no|Not just a rename, it does not close #225.
HUNT not only a rename; does not close|226|no|This is not only a rename; it does not close #226.
HUNT Not only docs: does not close|227|no|Not only docs: this does not close #227.
HUNT Not only does it …, does not close|228|no|Not only does it rename things, it does not close #228.
HUNT component only (filter overreach?)|241|yes|This component only touches docs; Closes #241.
HUNT nor-clause 1st|231|no|This does not close #231, nor does it fix #232.
HUNT nor-clause 2nd (pre-existing?)|232|no|This does not close #231, nor does it fix #232.
HUNT No, never fixes … nor closes 1st|239|no|No, this never fixes #239 nor closes #240.
HUNT No, never fixes … nor closes 2nd|240|no|No, this never fixes #239 nor closes #240.
HUNT does not just fix (filter rescue)|252|yes|This does not just fix #252.
RESIDUAL hard-wrapped mention (known N6)|223|no|the bug that the earlier PR closes\n#223 was reopened
RESIDUAL narrative past tense (known N7)|224|no|PR #41 closed #224 prematurely; this reopens it.
DROPCAND No changes needed elsewhere; Closes|242|yes|No changes needed elsewhere; Closes #242.
DROPCAND There is no bug; this Closes|243|yes|There is no bug; this Closes #243.
DROPCAND No - it Closes|244|yes|No - it Closes #244.
DROPCAND Not sure, but Closes|245|yes|Not sure, but Closes #245.
ECASES

rm -rf "$TMP"
