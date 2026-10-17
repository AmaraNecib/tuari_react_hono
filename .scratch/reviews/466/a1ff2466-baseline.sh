#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="$1"
TMP="$(mktemp -d)"; FAKE_BIN="$TMP/bin"; mkdir -p "$FAKE_BIN" "$TMP/issues"
export PATH="$FAKE_BIN:$PATH" GH_TOKEN=fake-token GH_REPO=owner/repo TMP
fake_curl() {
  local method=GET url="" data=""
  while [ $# -gt 0 ]; do case "$1" in -X) shift; method="$1";; -d) shift; data="$1";; --) :;; -*) :;; *) [[ "$1" == https://* ]] && url="$1";; esac; shift; done
  local path="${url#https://api.github.com/repos/${GH_REPO}/}"
  case "$method:$path" in
    GET:pulls/*) cat "$TMP"/issues/"${path##*/}".json 2>/dev/null || printf '%s' '{"merged":true,"base":{"ref":"develop"}}' ;;
    GET:issues/*) cat "$TMP"/issues/"${path##*/}".json 2>/dev/null || printf '%s' '{"state":"open","body":""}' ;;
    PATCH:issues/*) echo closed >"$TMP/closed_${path##*/}"; printf '%s' '{"state":"closed"}' ;;
    POST:issues/*/comments) echo ok ;;
    *) return 1 ;;
  esac
}
cat >"$FAKE_BIN/curl" <<E
#!/usr/bin/env bash
$(declare -f fake_curl)
fake_curl "\$@"
E
chmod +x "$FAKE_BIN/curl"
for n in 150 223 224 231 232 239 240 242 243 245 252 460 470; do jq -n --arg b fixture '{state:"open", body:$b}' >"$TMP/issues/$n.json"; done
echo "=== TARGET: $TARGET"
while IFS='|' read -r label num body; do
  [ -z "${label:-}" ] && continue
  rm -f "$TMP"/closed_* 2>/dev/null
  jq -cn --arg b "$(printf '%b' "$body")" '{state:"open", body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
  OUT=$(EVENT_QUALIFIED=1 PR_NUMBER=42 bash "$TARGET" 2>&1); rc=$?
  got=no; [ -f "$TMP/closed_$num" ] && got=yes
  printf '%-44s #%-5s closed=%s rc=%s\n' "$label" "$num" "$got" "$rc"
done <<'C'
BLOCKER No, this does not close #460.|460|No, this does not close #460.
BLOCKER No, it doesn't fix #470.|470|No, it doesn't fix #470.
nor-clause 2nd|232|This does not close #231, nor does it fix #232.
nor-clause 2nd (No, never … nor)|240|No, this never fixes #239 nor closes #240.
does not just fix (filter rescue)|252|This does not just fix #252.
hard-wrapped mention (N6)|223|the bug that the earlier PR closes\n#223 was reopened
narrative past tense (N7)|224|PR #41 closed #224 prematurely; this reopens it.
drop No changes needed; Closes|242|No changes needed elsewhere; Closes #242.
drop There is no bug; this Closes|243|There is no bug; this Closes #243.
drop Not sure, but Closes|245|Not sure, but Closes #245.
C
rm -rf "$TMP"
