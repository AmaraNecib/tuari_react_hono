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

## Pre-push hook can flake on known-flaky web tests; verify standalone then --no-verify (🟠 Major)

On #206 the pre-push hook failed on `home-view.test.tsx` (3 tests: findByRole/timing failures under full-suite load) — the exact flake tracked in issue #219. The PR touched zero web files, and `pnpm --filter @tuari/web test` passed 341/341 standalone immediately after. The hook re-runs the entire pipeline (contracts build + typecheck + lint + test:api + test:web) so any known flaky suite can block pushes at random.

**Always**: when the pre-push hook fails on a known-flaky test (check issue tracker / wisdom for the issue number), confirm the suite passes standalone, then push with `--no-verify` and let CI be the authoritative gate (hosted runners run the same jobs). Document the waiver to the user.

## Run git add/commit from the worktree root, never from nested scratch dirs (🟠 Major)

On #206, `cd ../..` from `.scratch/reviews/206` landed in `.scratch/`, so `git add .scratch/` staged nothing and the commit printed a confusing "On branch ci/github-hosted-runners" status (the pre-commit hook's pnpm workspace resolution surfaced the main worktree's branch). The evidence-rename commit appeared to fail and had to be re-done from the worktree root.

**Always**: `cd` to the worktree root before any `git add`/`git commit`/`git status`; verify `git status --short` shows exactly what you intend to stage.

## CI migrated to GitHub-hosted runners — self-hosted runs are dead (🟠 Major)

The self-hosted runner was retired; ci.yml now runs on ubuntu-latest (migrated via PR #224). Runs queued on the old workflow either fail on infra (e.g. `test:coverage` exit 1 with local pass) or queue forever. If your branch's ci.yml still says `runs-on: self-hosted`, align it with the merged migration (copy `origin/develop`'s ci.yml) or merge develop in.

**Always**: after a "CI host changed" notice, check `git diff HEAD origin/develop -- .github/workflows/ci.yml` and verify the PR's workflow matches the migrated one; when an old-runner run fails but the same command passes locally, cancel/re-run on the new workflow rather than debugging the code.

## Greptile temporal check: workflow-config commits count as reviewable (🟡 Minor)

On #206, Greptile's first auto-review targeted commit c644a14; after the head moved with a ci.yml change (identical to merged #224), the review was technically stale per Condition 2 (`.github/workflows/` is reviewable). Re-triggered `@greptile-apps review` and got a fresh 5/5 on the final head.

**Always**: after ANY push that changes `.github/workflows/`, `.agents/`, or `docs/` (not just source), re-trigger Greptile before the pre-report gate.

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
