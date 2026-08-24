# Code Review — issue #54 (auto-close-issues workflow)

- base: origin/develop @ a23eaaf (live)
- branch: fix/issue-54-auto-close-workflow
- HEAD reviewed: b378eb2 (squashed on fresh develop 0404187; Greptile CLI 5/5 + hosted PR review 5/5 after casing fix)
- tier: Standard (CI/workflow change)

## Spec axis

The issue: `close-linked-issues` fails 3/3 (runs 32641681287, 32612598672,
32610705291); logs unavailable; closing works only by hand.

Root cause found and fixed, with BEFORE/AFTER evidence in
`54-design.md` and the live dispatch runs:

| Before (hosted runner) | After (self-hosted) |
| --- | --- |
| `steps: []`, zero jobs/steps, ~3s, empty `runner_name` | `Set up job` + `Checkout` + script execute (success) |
| Same failure signature across nightly/release-metadata/beta (all hosted) | ci.yml self-hosted jobs always succeeded |
| dispatch dry-run: `gh CLI not found` (no gh, no sudo) | curl+jq backend, no provisioning |
| dispatch dry-run: 403 on PR read | `pull-requests: read` added; `issues/45: ok len=1496` |
| "No refs" bug (diagnostics swallowed by `$(...)`) | `api()` emits value only; diag via temp file, flushed to log |

Acceptance items from issue #54:
- closes linked issues on merges into develop — workflow trigger unchanged,
  logic preserved, script extracted, all conservative rules intact ✓
- run works on self-hosted (root cause) ✓
- conservative skip rules kept: body-only keywords + `\b` anchors, sub-issue
  guard, remaining/todo-in-open-issue guard, self-reference guard, WARN-not-
  fail on close errors ✓ (unit-tested, 31 scenarios)
- fail-open optional lookups with clear echo output ✓ (api() diag + `SKIP…`
  reasons + `WARN:` lines)
- least-privilege permissions kept: `contents: read, issues: write`,
  +`pull-requests: read` (read-only, required to read a PR body from the
  dispatch harness) ✓
- run-summary step listing closed/skipped issues with reasons ✓
  (`GITHUB_STEP_SUMMARY` table — verified in live + local runs)

## Standards axis

- `set -euo pipefail` hard-analyzed: every grep pipeline guarded with
  `|| true`; arithmetic only after `as_num` normalization; API calls wrapped
  so failures never kill the job; `if !` guards around the close.
- Shell readability: functions with doc comments, env contract documented at
  the top, no external deps beyond curl + jq (both confirmed present).
- No `git add -A`; source/config/scripts staged explicitly.
- Comments preserved from the original workflow (the conservative-rules
  rationale block) and updated for the backend choice.

## Findings addressed during review

1. api() diagnostics initially corrupted the captured value (echo inside
   `$(...)`) — fixed by value-on-stdout + diag-file pattern.
2. Subshell scope loss for the diag accumulator — fixed with a temp file.
3. `${#VAR:-0}` bad substitution — removed.
4. `pull-requests` permission gap discovered live — fixed.
5. Probe step and debug commits removed from final tree.
6. **Greptile finding (CLI) round 1 (conf 3/5)**: the dispatch harness with
   `dry_run=false` could close issues from a PR that was never merged into
   develop. Fixed: the script refuses to close anything unless the PR's
   `merged=true` and `base.ref=develop` (checked once per run, DRY_RUN
   exempt).
7. **Greptile finding round 2 (conf 4/5)**: the qualification read
   `.merged`/`.base` from GET /issues/N, which carries neither for a PR
   (verified live) — it would have refused every close. Switched to
   GET /pulls/N (`merged:true`, `base.ref:develop` verified live;
   `pull-requests: read` already granted).

Final Greptile round: **5/5, 0 comments** (see 848ebf8-greptile-local.md).

## Test audit (compact, unit round per brief)

Coverage matrix in scripts/ci/test-close-linked-issues.sh (31 assertions,
all green): happy close, closed-skip, sub-issue guard (open + all-done),
remaining-guard (open + closed refs), lineage non-block (#201/Part of #200),
self-reference skip, mid-word non-match, no-refs, DRY_RUN, sub-issue-field-
absent fail-open, whole-API failure safe-skip, PATCH failure WARN, missing
token error. E2E not applicable (workflow; no Playwright per brief).

Not fixable in this round (documented): a real `pull_request` closed event on
develop (parent owns merge; will be the final proof).
---
POST-EVIDENCE: evidence commit 482d008 touches only .scratch (non-reviewable). Reviewed code HEAD is 848ebf8; evidence filenames carry that SHA.

## Waiver (pre-existing base failure)

`apps/web/src/components/ui/createable-select.test.tsx > commits a selection on successive open/close cycles` fails deterministically on origin/develop itself (verified 3/3 runs at 0404187 — arrived with #55 base-ui upgrade). Zero web files touched by this branch. Tracked as a follow-up for the parent.

POST-EVIDENCE: PR #56 opened; review requested via comment. Evidence filenames carry code HEAD 56e1ed6.
