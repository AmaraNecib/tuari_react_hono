# Process Wisdom

## Evidence SHA must track the final reviewed commit (🟠 Major)

The guard's staleness check compares evidence filenames (`.scratch/reviews/<id>/<sha>-*.md`)
to HEAD. If CI/Greptile loops add commits after the reviews, the old-SHA evidence
goes stale. Fix pattern: after the last code change, re-run the code-review
sub-agents against `git diff <base>...HEAD`, `git mv` the evidence files to the
final SHA (appending a "post-evidence delta" note for test-only/Greptile rounds),
then commit the evidence. The evidence commit itself only touches `.scratch/`
(non-reviewable), so the staleness diff stays clean.

**Always**: refresh evidence right before the final push, not after.

## apps/api `env.ts` throws at module load (🟠 Major)

`src/infrastructure/config/env.ts` calls `requireEnv(process.env, "BETTER_AUTH_SECRET")`
at import time (`export const env = createEnv()`). Any test that transitively
imports `runtime-env` (e.g. `app/dependencies.ts`) crashes on a cold env unless
`BETTER_AUTH_SECRET` is set. Pattern: set `process.env.BETTER_AUTH_SECRET` at the
top of the test file **before a dynamic `await import()`** of the heavy module.
Vitest's per-file fork isolation keeps the mutation local (don't rely on
`isolate: false` setups).

**Always**: set the env var + dynamic import; never static-import dependency
wiring in tests without it.

## Greptile loop: re-trigger explicitly after fixes (🟡 Minor)

`@greptile-apps review` comment re-triggers Greptile after a fix push. Greptile's
inline summary gives a confidence score AND a "Files Needing Attention" list —
check both, not just the score (guard Phase 3 reads the comment). A 4/5 with two
style findings moved to 5/5 with none after one small fix round.

**Always**: read the Greptile inline comment for actionable findings even when the
check is green.

## `[skip ci]` in any commit of a push suppresses ALL workflow events for that push (🟠 Major)

Pushing the Greptile-fix commit together with an evidence commit whose message
contained `[skip ci]` produced NO new CI run — GitHub skips the push's
workflow triggers if any commit in the pushed range carries the marker. The
PR then had checks attached only to an old head (empty-commit head), while
CI/check-runs for the real head were empty.

**Always**: never put `[skip ci]` on a commit that shares a push with code
changes; after pushing a Greptile-fix round, verify a new CI run started on
the new head (`gh run list --workflow=ci.yml --limit 2`) before re-triggering
Greptile.

## CI `pull_request` run can silently not fire; empty commit re-triggers it (🟡 Minor)

On PR creation the first time, no CI run appeared at all (event never
delivered). An empty commit WITHOUT `[skip ci]` fired the `synchronize` event
and CI queued normally (the concurrency group auto-cancels the stale run).

**Always**: after opening a PR, check `gh run list --workflow=ci.yml` actually
shows a run; if missing, push an empty commit (message must NOT contain
`[skip ci]`) to re-fire the event.

## Turbo cache logs may show other worktree paths (🟡 Minor)

Turbo cache replays log lines from other worktrees (e.g. `cleanup-dirty-wip`) —
paths in cached output are not the current worktree. Re-run the affected package's
command directly when you need certainty it actually ran on your files.

## Issues never auto-close on merge because PRs target `develop`, not the default branch `main` (🟠 Major)

PRs merge into `develop`, but GitHub's auto-close-on-merge fires **only for the
default branch** (`main`). So `Closes #N` in a PR title, body, or squash message
**never** closes the linked issue here — no matter where the keyword goes.
Evidence: #206 and #227 show `closedByPRs: []` despite being closed by merged
PRs (they were closed manually).

This repeatedly strands issues as OPEN after their work merged (#204, #195,
#206, #212, #215, #226, #227…), and the existing `docs/lessons/gh-pr-merge-squash-issue-close.md`
misdiagnoses it as a `gh pr merge` CLI quirk — it is not; it's the branch target.

**Always**: after merging a PR that claims to close an issue, run
`gh issue close <num> --comment "delivered by PR #<num>…"` immediately. When
syncing/batching merges, sweep every merged PR's claimed issue and close any
still OPEN. Do not trust the closing keyword — verify `gh issue view <num> --json state`.

**Multi-PR issues (🟠 Major)**: an issue can need SEVERAL PRs to be fully
delivered (#177 needed #179 + #189 + #258; #177's first PR said "Closes #177"
but only did Phase 3). Never close an issue on the FIRST PR that mentions it —
check the issue body and the PR for deferred/follow-up/part-of references to
still-open issues, and confirm the issue's acceptance criteria are actually
met before closing. PR convention: a PR that delivers PART of an issue must
say "Part of #N" — only the finishing PR says "Closes #N".

**Systemic fix (implemented)**: a GitHub Action (`auto-close-issues.yml`) closes
referenced issues on merge to `develop`, but is deliberately CONSERVATIVE — it
honors "Closes #N" only in the PR body (not title), skips issues that defer to
still-open issues, skips parents with open sub-issues, and logs every SKIP so
humans verify. It is a convenience, not the authority — the manual sweep still
applies.
