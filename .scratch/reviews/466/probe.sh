#!/usr/bin/env bash
# Edge-case probe: drives the REAL close-linked-issues.sh with a fake curl on
# PATH and reports, per candidate body, which issue numbers actually got a
# PATCH (i.e. would be closed for real). Read-only w.r.t. the repo.
#
#   bash .scratch/reviews/466/probe.sh [path/to/close-linked-issues.sh]
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
      cat "$TMP/issues/$pnum.json" 2>/dev/null || printf '%s' '{"merged":false,"base":{"ref":""}}' ;;
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

mk_issue() { # num state body [total done]
  local json
  json=$(jq -n --arg s "$2" --arg b "$3" '{state:$s, body:$b}')
  if [ $# -ge 5 ]; then
    json=$(printf '%s' "$json" | jq --argjson t "$4" --argjson d "$5" '.sub_issues_summary={total:$t,completed:$d}')
  fi
  printf '%s' "$json" >"$TMP/issues/$1.json"
}

CANDIDATES="0 12 150 151 201 202 203 999 1000 99999999999999999999"
for n in $CANDIDATES; do mk_issue "$n" open "probe target"; done

run_case() { # label body
  rm -f "$TMP"/closed_* 2>/dev/null
  jq -cn --arg s open --arg b "$2" '{state:$s, body:$b, merged:true, base:{ref:"develop"}}' >"$TMP/issues/42.json"
  OUT=$(PR_NUMBER=42 bash "$TARGET" 2>&1); RC=$?
  local closed="" f
  for n in $CANDIDATES; do [ -f "$TMP/closed_$n" ] && closed="$closed $n"; done
  printf '%-34s rc=%s closed=[%s]\n' "$1" "$RC" "${closed# }"
}

echo "=== TARGET: $TARGET"
echo "--- 1. structural / formatting variants ---"
run_case "nested-list-bullet"      '- Closes #150'
run_case "blockquote-nested"       '> Closes #150'
run_case "numbered-list"           '1. Closes #150'
run_case "lowercase-colon"         'closes: #150'
run_case "space-colon-space"       'Closes : #150'
run_case "tab-separator"           "$(printf 'Closes\t#150')"
run_case "no-separator"            'Closes#150'
run_case "crlf-end-of-line"        "$(printf 'Closes #150\r\nmore text')"
run_case "nbsp-separator"          "$(printf 'Closes\u00a0#150')"
run_case "line-start"              "$(printf 'Closes #150')"
run_case "keyword-then-newline-ref" "$(printf 'Closes:\n#150')"
run_case "unicode-bullet-sep"      "$(printf 'Closes\u2014#150')"

echo "--- 2. multiple refs on one line ---"
run_case "two-refs-one-line"       'Closes #150 and #151'
run_case "ref-then-foreign-mention" 'Closes #150, related to #151'
run_case "duplicate-same-line"     'Closes #150 and Closes #150'
run_case "two-lines"               "$(printf 'Closes #150\nFixes #151')"

echo "--- 3. URL / markdown / code ---"
run_case "ref-inside-url"          'Closes https://github.com/o/r/issues/150'
run_case "markdown-link"           'Closes [#150](https://x/y)'
run_case "inside-code-span"        'To close it, write `Closes #150` in the body.'
run_case "fenced-code-block"       "$(printf '```\nCloses #150\n```')"

echo "--- 4. negation variants ---"
run_case "neg-comma"               'This does not close, #150.'
run_case "neg-colon"               'This does not close: #150.'
run_case "neg-across-newline"      "$(printf 'This does not\nclose #150.')"
run_case "neg-paren-punct"         'This does not close (#150).'
run_case "neg-two-words"           'We are not going to close #150'
run_case "neg-three-words"         'We are not going to be closing #150'
run_case "neg-dont"                "This don't close #150"
run_case "neg-cannot"              'This cannot close #150'
run_case "neg-no-longer"           'We no longer close #150 from here.'
run_case "neg-same-number-both"    'This does not close #150. Later text Closes #150.'
run_case "affirmative-then-negator" 'Not urgent but Closes #150.'
run_case "not-only-fixes"          'This not only fixes #150 but also tidies the hook.'
run_case "not-a-rewrite"           'This is not a rewrite. Closes #150.'
run_case "neg-then-affirmative-other" 'Does not close #150. Closes #151.'

echo "--- 5. number shapes ---"
run_case "nonnumeric"              'Closes #abc'
run_case "trailing-letters"        'Closes #12abc'
run_case "huge-number"             'Closes #99999999999999999999'
run_case "zero"                    'Closes #0'
run_case "leading-zeros"           'Closes #0150'
run_case "float"                   'Closes #150.5'

rm -rf "$TMP"
