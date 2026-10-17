#!/usr/bin/env bash
# Edge-case probe: run the REAL close-linked-issues.sh per candidate body with a
# fake curl and report which numbers received a PATCH.
# Usage: bash 978cf95b-probe.sh /path/to/close-linked-issues.sh
set -uo pipefail
TARGET="$1"
TMP="$(mktemp -d)"; BIN="$TMP/bin"; mkdir -p "$BIN" "$TMP/issues"
export PATH="$BIN:$PATH" GH_TOKEN=fake GH_REPO=owner/repo TMP

fake_curl() {
  local method=GET url=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -X) shift; method="$1" ;;
      -d) shift ;;
      --) : ;;
      -*) : ;;
      *) [[ "$1" == https://* ]] && url="$1" ;;
    esac
    shift
  done
  local path="${url#https://api.github.com/repos/owner/repo/}" num=""
  case "$method:$path" in
    GET:pulls/*) printf '%s' '{"merged":true,"base":{"ref":"develop"}}' ;;
    GET:issues/*)
      [[ "$path" =~ issues/([0-9]+) ]] && num="${BASH_REMATCH[1]}"
      cat "$TMP/issues/$num.json" 2>/dev/null || printf '%s' '{"state":"open","body":""}' ;;
    PATCH:issues/*)
      [[ "$path" =~ issues/([0-9]+) ]] && num="${BASH_REMATCH[1]}"
      echo closed >"$TMP/closed_$num"; printf '%s' '{"state":"closed"}' ;;
    POST:issues/*/comments) echo ok ;;
    *) echo "unhandled: $method $path" >&2; return 1 ;;
  esac
}
cat >"$BIN/curl" <<EOF
#!/usr/bin/env bash
$(declare -f fake_curl)
fake_curl "\$@"
EOF
chmod +x "$BIN/curl"

probe() { # name body num...
  local name="$1" body="$2"; shift 2
  rm -rf "$TMP/issues"; mkdir -p "$TMP/issues"; rm -f "$TMP"/closed_* 2>/dev/null
  printf '%s' '{"state":"open","body":"x","merged":true,"base":{"ref":"develop"}}' >"$TMP/issues/42.json"
  local n
  for n in "$@"; do printf '%s' '{"state":"open","body":""}' >"$TMP/issues/$n.json"; done
  local out rc closed=""
  out=$(PR_NUMBER=42 PR_BODY="$body" bash "$TARGET" 2>&1); rc=$?
  for n in "$@"; do [ -f "$TMP/closed_$n" ] && closed="$closed $n"; done
  printf '%-46s rc=%-3s CLOSED=[%s] ignoring=%s\n' "$name" "$rc" "${closed# }" "$(grep -c Ignoring <<<"$out")"
}

echo "== TARGET: $TARGET"

probe "CRLF affirmative"            $'Closes #101\r\n'                        101
probe "CRLF negated + affirmative"  $'This does not close #102.\r\nCloses #103.' 102 103
probe "hash between negator/kw"     'See #104. This does not close #105.'    104 105
probe "no-substring 'Note: this Closes #N'" 'Note: this Closes #106.'         106
probe "no-substring 'Now the PR Closes #N'"  'Now the PR Closes #107.'         107
probe "no-substring 'Nothing in #X; Closes #N'" 'Nothing in #108 relates; Closes #109.' 108 109
probe "no-substring 'There is no change. Closes #N'" 'There is no change. Closes #110.' 110
probe "no-substring 'novel approach Closes #N'" 'The novel approach Closes #111.' 111
probe "unicode NBSP separator"      $'Closes\u00a0#112'                      112
probe "unicode em-dash separator"   $'Closes\u2014#113'                      113
probe "multi keywords one line"     'Closes #114, Fixes #115, Resolves #116' 114 115 116
probe "body only newlines"          $'\n\n\n'                                -
probe "'Closes#N' no separator"     'Closes#117'                             117
probe "'Closes:#N' colon no space"  'Closes:#118'                            118
probe "long single line (100k)"     "Closes #119 $(printf 'x%.0s' $(seq 1 100000))" 119
probe "long single line (200k)"     "Closes #120 $(printf 'x%.0s' $(seq 1 200000))" 120
probe "negator 3 words out w/ punct" 'This does not, in any way, close #121.' 121
probe "negator 4 words out"         'Do not merge this until it Closes #122.' 122
probe "same-number negate+close"    'Closes #123, though this does not close #123.' 123
probe "interjection No,"            'No, this Closes #124.'                  124

# case-insensitive keyword inside prose word
probe "keyword inside word 'unclosed'" 'The PR is unresolved and unclosed #125.' 125
rm -rf "$TMP"
