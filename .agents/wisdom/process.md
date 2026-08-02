# Process Wisdom

## `gh pr create` defaults to `main`; always pass `--base develop` (🟠 Major)

This repo's default branch is `main`, but PRs must target `develop`. Creating a
PR without `--base develop` silently points it at `main` — which makes the PR
contain the ENTIRE develop-vs-main history instead of just your commits, and
CI/Greptile review the wrong diff. Fix after the fact is `gh pr edit <n> --base develop`,
but the first CI run + Greptile trigger will already have run against the wrong base.

**Always**: `gh pr create --base develop` explicitly, then verify
`gh pr view <n> --json baseRefName,commits` shows your commits only.

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
