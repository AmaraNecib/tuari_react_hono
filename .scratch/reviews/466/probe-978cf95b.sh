#!/usr/bin/env bash
# Round-2 probe: drives the REAL close-linked-issues.sh (head 978cf95b) with a
# fake curl on PATH, and reports which numbers actually got PATCHed.
# Read-only w.r.t. the repo.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="${1:-$ROOT/scripts/ci/close-linked-issues.sh}"

TMP="$(mktemp -d)"
FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_BIN" "$TMP/issues"
export PATH="$FAKE_BIN:$PATH"
export GH_TOKEN=fake-token GH_REPO=owner/repo TMP

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
    GET:pulls/*)
      local pnum="" ; [[ "$path" =~ pulls/([0-9]+) ]] && pnum="${BASH_REMATCH[1]}"
      cat "$TMP/issues/$pnum.json" 2>/dev/null || printf '%s' '{"merged":true,"base":{"ref":"develop"}}' ;;
    GET:issues/*)
      local num="" ; [[ "$path" =~ issues/([0-9]+) ]] && num="${BASH_REMATCH[1]}"
      cat "$TMP/issues/$num.json" 2>/dev/null || printf '%s' '{"state":"open","body":""}' ;;
    PATCH:issues/*)
      local num="" ; [[ "$path" =~ issues/([0-9]+) ]] && num="${BASH_REMATCH[1]}"
      echo closed >"$TMP/closed_$num"; printf '%s' '{"state":"closed"}' ;;
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

mk_issue() { # num state body
  jq -n --arg s "$2" --arg b "$3" '{state:$s, body:$b}' >"$TMP/issues/$1.json"
}

CAND="150 151 152 153 154 155 156 157 158 159 160 200 201 202 203 204 205 206 207 208 209 210 211 212 213 214 215 216 217 218 219 220"
for n in $CAND; do mk_issue "$n" open "probe target"; done

run_case() { # label body
  rm -f "$TMP"/closed_* 2>/dev/null
  jq -cn --arg s open --arg b "$2" '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
  OUT=$(EVENT_QUALIFIED=1 PR_NUMBER=42 bash "$TARGET" 2>&1); RC=$?
  local closed="" f
  for n in $CAND; do [ -f "$TMP/closed_$n" ] && closed="$closed $n"; done
  printf '%-42s rc=%s closed=[%s]\n' "$1" "$RC" "${closed# }"
  if [ "${SHOW_LOG:-0}" = "1" ]; then printf '%s\n' "$OUT" | grep -E 'Ignoring|No .Closes|Checking' | sed 's/^/        /'; fi
}

echo "=== TARGET: $TARGET"
echo
echo "--- A. bare 'no' as a word / inside other words (NEW negator) ---"
run_case "A1 No, it Closes #150 (must CLOSE)"      'No, it Closes #150.'
run_case "A2 no plans to close #150 (must NOT)"    'We have no plans to close #150.'
run_case "A3 nobody closes #150"                   'Nobody closes #150 here.'
run_case "A4 nothing closes #150"                  'Nothing closes #150 automatically.'
run_case "A5 no bug; this Closes #150 (must CLOSE)" 'There is no bug; this Closes #150.'
run_case "A6 No changes needed; Closes #150 (must CLOSE)" 'No changes needed elsewhere; Closes #150.'
run_case "A7 No test changes; this Closes #150 (must CLOSE)" 'No test changes; this Closes #150.'
run_case "A8 No, however it Closes #150"           'No, however it Closes #150.'
run_case "A9 No - it Closes #150"                  'No - it Closes #150.'
run_case "A10 explicitly no regression; Closes #151" 'No regression found; Closes #151.'

echo
echo "--- B. 'not' in an unrelated clause within 3 words ---"
run_case "B1 Not sure, but Closes #150"            'Not sure, but Closes #150.'
run_case "B2 Not blocked; Closes #150"             'Not blocked; Closes #150.'
run_case "B3 Do not merge until it Closes #150 (3 words)" 'Do not merge until it Closes #150.'
run_case "B4 Do not merge this until it Closes #150 (4 words)" 'Do not merge this until it Closes #150.'
run_case "B5 Notably, this Closes #150"            'Notably, this Closes #150.'
run_case "B6 Notional cleanup; Closes #150"        'Notional cleanup only; Closes #150.'

echo
echo "--- C. punctuation-only gaps ---"
run_case "C1 Closes:#150"                          'Closes:#150'
run_case "C2 Closes : #150"                        'Closes : #150'
run_case "C3 Closes.** #150"                       'Closes.** #150'
run_case "C4 Closes - #150"                        'Closes - #150'
run_case "C5 Closes\\t#150"                        "$(printf 'Closes\t#150')"
run_case "C6 does not,however,close #150"          'This does not,however,close #150.'
run_case "C7 does not...close #150"                'This does not...close #150.'

echo
echo "--- D. '#' inside the negator gap ---"
run_case "D1 not #151 or #150 closes"              'This does not Close #151, so #150 stays open.'
run_case "D2 not fix#150 weird"                    'This will not fix#150.'
run_case "D3 no #150 close (ref before verb)"      'There is no #150 close to make.'

echo
echo "--- E. CRLF bodies ---"
run_case "E1 CRLF Closes #150"                     "$(printf 'Closes #150\r\nmore text')"
run_case "E2 CRLF negation split"                  "$(printf 'This does not\r\nclose #150.')"
run_case "E3 CRLF keyword line, ref next line"     "$(printf 'Closes\r\n#150')"
run_case "E4 CRLF No, interjection"                "$(printf 'No,\r\nit Closes #150.')"

echo
echo "--- F. same number negated + affirmative ---"
run_case "F1 negated then affirmative same"        'This does not close #150. Later: Closes #150.'
run_case "F2 affirmative in one sentence, negated next" 'Closes #150. (Well, it does not close #150.)'
run_case "F3 negated #150 + affirmative #151"      'This does not close #150 but Closes #151.'

echo
echo "--- G. affirmative extraction regressions (must CLOSE) ---"
run_case "G1 Closes #150"                          'Closes #150'
run_case "G2 **Closes** #150"                      '**Closes** #150'
run_case "G3 Closes **#150**"                      'Closes **#150**'
run_case "G4 Closes\\n#150"                        "$(printf 'Closes\n#150')"
run_case "G5 this not only fixes #150"             'This not only fixes #150 and more.'
run_case "G6 doesn't just fix #150"                "This doesn't just fix #150 — it rewrites it."
run_case "G7 not merely resolves #150"             'This not merely resolves #150 but ends it.'
run_case "G8 not simply closes #150"               'This not simply closes #150, it deletes it.'
run_case "G9 Hardly any change; Closes #150"       'Hardly any change; Closes #150.'

echo
echo "--- H. must NOT close (mention forms) ---"
run_case "H1 filed as #150"                        'A finding is filed as #150.'
run_case "H2 Part of #150"                         'Part of #150.'
run_case "H3 bare mention #150"                    'Tracked in #150.'
run_case "H4 the fix for #150"                     'This documents the fix for #150.'

echo
echo "--- I. false-close hunting: past tense / narrative ---"
run_case "I1 PR closed #150 prematurely"           'PR #41 closed #150 prematurely; this reopens it.'
run_case "I2 hard-wrapped prose false close"       "$(printf 'the bug that the earlier PR closes\n#150 was reopened')"
run_case "I3 no.\\nCloses #150"                    "$(printf 'This changes nothing.\nCloses #150')"

rm -rf "$TMP"
