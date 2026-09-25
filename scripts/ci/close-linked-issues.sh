#!/usr/bin/env bash
# Close issues referenced by a merged PR's body (issue #54).
#
# GitHub only auto-closes issues when a PR merges into the DEFAULT branch.
# This repo merges into `develop`, so this script closes linked issues
# manually. Extracted from .github/workflows/auto-close-issues.yml so it can
# be tested locally (scripts/ci/test-close-linked-issues.sh) and reused by a
# workflow_dispatch validation harness.
#
# Env contract:
#   GH_TOKEN, GH_REPO   — token + "owner/repo" target (set by the workflow)
#   PR_NUMBER           — PR whose body is scanned (required)
#   PR_BODY             — optional; fetched via the API when absent
#   DRY_RUN=1           — log what WOULD happen, never close anything
#   EVENT_QUALIFIED=1   — set by the workflow for a real pull_request
#                         closed+merged event; the workflow `if:` already
#                         proved merged-into-develop, so the in-script API
#                         qualification is skipped (a transient read failure
#                         must never silently leave delivered issues open).
#   GITHUB_STEP_SUMMARY — optional; a Closed/Skipped table is appended there
#
# Backend: bash + curl + jq — deliberately AVOIDS the `gh` CLI. The repo's
# self-hosted runner (probed 2026-08-24, issue #54) has curl + jq but NO gh
# and no passwordless sudo, so gh could not be installed from the workflow.
# curl + jq are the minimum guaranteed toolchain.
#
# Safety rules (preserved from the original workflow):
#   1. Only "Closes/Fixes/Resolves #N" in the PR BODY counts (never titles).
#   2. Skips parent/tracker issues that still have open sub-issues.
#   3. Skips issues whose body marks REMAINING work in a still-open issue
#      ("remaining"/"todo" — NOT lineage markers like "Part of #N").
#   4. Skips when the PR body marks THE NUMBER BEING CLOSED itself as
#      partial/deferred (self-reference). "Closes #201 / Part of #200"
#      still closes #201.
#   5. Every optional API lookup fails OPEN (a failed lookup never blocks a
#      close and never kills the run) and every decision is echoed + summed.
#
# Convention enforced by review, not here: partial deliveries say
# "Part of #N"; only finishing PRs say "Closes #N".

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
case "$DRY_RUN" in
1 | true | TRUE | True | yes | YES) DRY_RUN=1 ;;
*) DRY_RUN=0 ;;
esac
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-}"

summary_rows=""

summarize() { # status issue reason  (tab-separated rows; reason may contain spaces)
  summary_rows="${summary_rows}${1}"$'\t'"${2}"$'\t'"${3}"$'\n'
}

emit_summary() {
  if [ -z "$summary_rows" ] || [ -z "$SUMMARY_FILE" ]; then
    return 0
  fi
  local table
  table=$'| Outcome | Issue | Reason |\n| --- | --- | --- |'
  local outcome issue reason
  while IFS=$'\t' read -r outcome issue reason; do
    [ -n "$outcome" ] || continue
    table="${table}"$'\n| '"${outcome//|/\\|}"' | '"${issue//|/\\|}"' | '"${reason//|/\\|}"' |'
  done <<EOF
$summary_rows
EOF
  {
    printf '\n### Auto-close results (PR #%s)\n\n%s\n' "${PR_NUMBER:-?}" "$table"
    if [ "$DRY_RUN" = "1" ]; then
      printf '\n> DRY RUN — nothing was actually closed.\n'
    fi
  } >>"$SUMMARY_FILE"
}

# Preflight: fail loudly and early on a missing tool or token — a clear
# message beats a confusing mid-script death.
for tool in curl jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "::error::$tool not found on runner — auto-close needs curl + jq"
    exit 1
  fi
done
if [ -z "${GH_TOKEN:-}" ]; then
  echo "::error::GH_TOKEN is not set — auto-close cannot talk to the GitHub API"
  exit 1
fi

# Fail-open API wrapper: prints ONLY the extracted value on stdout (callers
# capture it in command substitutions — any stray echo would corrupt the
# data). Diagnostics append to a FILE (global vars don't survive the
# command-substitution subshell) and are flushed to the run log by
# show_api_diag() after each call (issue #54: "clear echo output").
API_DIAG_FILE="$(mktemp)"

api() { # path jq-expr
  local body out rc jrc
  body=$(curl -fsSL --max-time 30 \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${GH_REPO}/${1}" 2>&1) && rc=0 || rc=$?
  if [ "$rc" -ne 0 ]; then
    printf 'api GET %s: FAILED curl_rc=%s (%s)\n' "$1" "$rc" "$(printf '%s' "$body" | tr '\n' ' ' | head -c 120)" >>"$API_DIAG_FILE"
    printf ''
    return 0
  fi
  out=$(printf '%s' "$body" | jq -r "${2}" 2>&1) && jrc=0 || jrc=$?
  if [ "$jrc" -ne 0 ]; then
    printf 'api GET %s: FAILED jq_rc=%s (%s)\n' "$1" "$jrc" "$(printf '%s' "$body" | tr '\n' ' ' | head -c 120)" >>"$API_DIAG_FILE"
    printf ''
    return 0
  fi
  printf 'api GET %s: ok len=%s\n' "$1" "${#out}" >>"$API_DIAG_FILE"
  printf '%s' "$out"
}

show_api_diag() {
  cat "$API_DIAG_FILE" 2>/dev/null || true
  : >"$API_DIAG_FILE"
}

ISSUE_CACHE_DIR="$(mktemp -d)"
trap 'emit_summary; rm -rf "$ISSUE_CACHE_DIR" "$API_DIAG_FILE"' EXIT

PR_BODY="${PR_BODY:-}"
if [ -z "$PR_BODY" ]; then
  echo "PR_BODY not provided — fetching body of PR #$PR_NUMBER"
  # GET /issues/N returns a PR's body too; the workflow grants
  # pull-requests: read so this works for PR numbers, and issues: write
  # covers plain-issue reads. (issue #54)
  PR_BODY=$(api "issues/${PR_NUMBER}" '.body // ""')
  show_api_diag
fi

# Numeric guard: treat anything non-numeric as 0 so a malformed lookup can
# never crash arithmetic under `set -e`.
as_num() {
  case "${1:-}" in
    '' | *[!0-9]*) echo 0 ;;
    *) echo "$1" ;;
  esac
}

# 1. Collect "Closes/Fixes/Resolves #N" from the PR BODY only. Word-boundary
#    anchors (\b) prevent mid-word matches like "unresolved #5".
numbers=$(
  printf '%s\n' "$PR_BODY" \
    | grep -oiE '\b(close[sd]?|closing|fix(e[sd])?|fixing|resolve[sd]?|resolving)\b[^#]*#([0-9]+)' \
    | grep -oE '#[0-9]+' \
    | tr -d '#' \
    | sort -un \
    || true
)

if [ -z "$numbers" ]; then
  echo "No 'Closes #N' reference in PR body #$PR_NUMBER — nothing to close."
  exit 0
fi

for num in $numbers; do
  echo "── Checking issue #$num ──"

  # One GET per issue; state + body + sub-issue summary all come from it.
  if ! curl -fsSL --max-time 30 \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${GH_REPO}/issues/$num" \
    >"$ISSUE_CACHE_DIR/$num.json" 2>/dev/null; then
    echo "  WARN: could not fetch issue #$num (API GET failed) — skipping safely"
    state=""
  else
    # REST states are lowercase ("open"/"closed") — normalize for comparisons
    state=$(jq -r '.state // ""' "$ISSUE_CACHE_DIR/$num.json" 2>/dev/null | tr '[:lower:]' '[:upper:]' || echo "")
  fi

  if [ "$state" != "OPEN" ]; then
    echo "  SKIP: #$num state=${state:-unknown} (not open)"
    summarize SKIP "#$num" "state ${state:-unknown} (not open)"
    continue
  fi

  # 2. Skip parents/trackers with open sub-issues. Fail-open: a lookup error
  #    yields 0 open sub-issues, i.e. never blocks the close.
  sub_total=$(jq -r '.sub_issues_summary.total // 0' "$ISSUE_CACHE_DIR/$num.json" 2>/dev/null || echo 0)
  sub_done=$(jq -r '.sub_issues_summary.completed // 0' "$ISSUE_CACHE_DIR/$num.json" 2>/dev/null || echo 0)
  sub_total=$(as_num "$sub_total")
  sub_done=$(as_num "$sub_done")
  if [ "$sub_total" -gt 0 ] && [ "$sub_total" -gt "$sub_done" ]; then
    echo "  SKIP: #$num is a parent with $((sub_total - sub_done)) open sub-issues"
    summarize SKIP "#$num" "parent tracker with $((sub_total - sub_done)) open sub-issue(s)"
    continue
  fi

  # 3. ISSUE-BODY guard — only genuine INCOMPLETE markers block. "Part of #N"
  #    is lineage (where an issue came from), never unfinished scope.
  issue_body=$(jq -r '.body // ""' "$ISSUE_CACHE_DIR/$num.json" 2>/dev/null || echo "")
  deferred=$(
    printf '%s' "$issue_body" \
      | grep -oiE '(remaining|todo|not yet done|still open)[^#]*#([0-9]+)' \
      | grep -oE '#[0-9]+' | tr -d '#' | sort -un || true
  )
  open_ref=""
  for ref in $deferred; do
    rstate=$(api "issues/${ref}" '.state // ""' | tr '[:lower:]' '[:upper:]')
    show_api_diag
    if [ "$rstate" = "OPEN" ]; then
      open_ref="$open_ref $ref"
    fi
  done
  if [ -n "$open_ref" ]; then
    echo "  SKIP: #$num marks remaining work in still-OPEN issue(s):$open_ref"
    summarize SKIP "#$num" "marks remaining work in still-open issue(s):$open_ref"
    continue
  fi

  # 4. PR-BODY guard — skip ONLY when the PR marks THIS number as
  #    partial/deferred. Lineage refs to OTHER numbers never block.
  pr_partial=$(
    printf '%s\n' "$PR_BODY" \
      | grep -oiE '(part of|defer(red)?|remaining|todo)[^#]*#'"$num"'([^0-9]|$)' \
      || true
  )
  if [ -n "$pr_partial" ]; then
    echo "  SKIP: PR #$PR_NUMBER marks #$num itself as partial/deferred"
    summarize SKIP "#$num" "PR #$PR_NUMBER marks it partial/deferred (self-reference)"
    continue
  fi

  # QUALIFICATION (defense in depth, issue #54): never close for a PR that
  # was not merged into develop. A real pull_request merge event already proves
  # that in the workflow `if:` and passes EVENT_QUALIFIED=1, so no API read is
  # needed there — a transient read failure must never silently leave delivered
  # issues open. Dispatch/dry runs must prove it in-script.
  # Uses the PULLS endpoint — GET /issues/N (PR-as-issue) carries no
  # .merged/.base fields (verified live; Greptile finding).
  if [ -z "${QUALIFIED:-}" ]; then
    if [ "${EVENT_QUALIFIED:-0}" = "1" ]; then
      echo "  QUALIFIED: pull_request merge event (workflow-gated, no API read)"
      QUALIFIED=1
    else
      pr_merged=$(api "pulls/${PR_NUMBER}" '.merged // false')
      show_api_diag
      pr_base=$(api "pulls/${PR_NUMBER}" '.base.ref // ""')
      show_api_diag
      if [ -z "$pr_merged" ] || [ -z "$pr_base" ]; then
        echo "  ERROR: cannot read PR #$PR_NUMBER merged/base state from the API — refusing to close anything"
        summarize ERROR "PR #$PR_NUMBER" "PR state unreadable — no closes performed"
        exit 1
      fi
      if [ "$pr_merged" != "true" ] || [ "$pr_base" != "develop" ]; then
        echo "  WARN: PR #$PR_NUMBER not merged into develop (merged=$pr_merged base=$pr_base) — refusing to close anything"
        summarize WARNED "PR #$PR_NUMBER" "not merged into develop — no closes performed"
        exit 0
      fi
      QUALIFIED=1
    fi
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "  DRY RUN: WOULD CLOSE #$num"
    summarize WOULD-CLOSE "#$num" "dry run — no action taken"
    continue
  fi

  # Real close: PATCH state=closed, then comment. Both fail-open with a WARN —
  # a transient API error must never kill the job or hide the situation.
  if ! curl -fsSL --max-time 30 -X PATCH \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -d '{"state":"closed"}' \
    "https://api.github.com/repos/${GH_REPO}/issues/$num" \
    >/dev/null 2>&1; then
    echo "  WARN: failed to close #$num — close manually"
    summarize WARNED "#$num" "close command failed — needs manual close"
    continue
  fi
  curl -fsSL --max-time 30 -X POST \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -d "{\"body\":\"Auto-closed: delivered by PR #$PR_NUMBER.\"}" \
    "https://api.github.com/repos/${GH_REPO}/issues/$num/comments" \
    >/dev/null 2>&1 || true
  echo "  CLOSED #$num"
  summarize CLOSED "#$num" "delivered by PR #$PR_NUMBER"
done

echo "── Done. Manually verify any SKIP lines on the next sync pass."