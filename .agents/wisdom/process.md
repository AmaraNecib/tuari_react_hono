# Process Wisdom

## Re-fetch develop before finalizing — concurrent agents may have fixed the same bug (🟠 Major)

On #254, the E2E spec exposed a real sqlite transaction bug
(`DrizzleAccountRepository.withTransaction` used an async callback against
sync-only better-sqlite3 → 500 on every profile update). I fixed it and added
regression tests — then re-fetched develop and found the concurrent coverage
PR (#291/#249) had independently landed the SAME fix and tests, plus the
service 401/409 tests my test-audit flagged. My production changes were fully
redundant; only the E2E spec + helpers remained unique. The rebase dropped
my API changes cleanly.

**Always**: before committing the "fix" a new test exposed, `git fetch` and
diff against the freshest `origin/develop` — especially when another agent
may be working on the same module (coverage PRs are notorious for rewriting
test files). Keep the test (it validates the merged fix), drop the redundant
implementation.


## Evidence SHA must track the final reviewed commit (🟠 Major)

The guard's staleness check compares evidence filenames (`.scratch/reviews/<id>/<sha>-*.md`)
to HEAD. If CI/Greptile loops add commits after the reviews, the old-SHA evidence
goes stale. Fix pattern: after the last code change, re-run the code-review
sub-agents against `git diff <base>...HEAD`, `git mv` the evidence files to the
final SHA (appending a "post-evidence delta" note for test-only/Greptile rounds),
then commit the evidence. The evidence commit itself only touches `.scratch/`
(non-reviewable), so the staleness diff stays clean.

**Always**: refresh evidence right before the final push, not after.

## apps/api `env.ts` module-load throw — RESOLVED in #212 (🟢 Obsolete workaround)

`src/infrastructure/config/env.ts` + `runtime-env.ts` (which evaluated `createEnv()` at
import time and threw when `BETTER_AUTH_SECRET` was absent) were **deleted in #212** in
favour of one injected `createAppConfig()` (Zod). The workaround below is no longer needed
for the api config path: consumers receive the validated `AppConfig` from the composition
root (`src/index.ts`), and `config/index.ts` reads env only inside the factory call.

**If you see this throw again**: something still imports a module that reads env at import
time. Historical pattern (pre-#212): set `process.env.BETTER_AUTH_SECRET` at the top of the
test file **before a dynamic `await import()`** of the heavy module; vitest's per-file fork
isolation keeps the mutation local. NOTE the cold better-auth transform still needs a
generous describe timeout (~60s) under full-suite load — see dependencies.test.ts.

## Scoped v8 coverage without the repo's thresholds (🟡 Minor)

`vitest.config.ts` gates 100% coverage only on `src/modules/{workforce,invoice}`. To measure
a different file set (e.g. the config module) without tripping the thresholds:
`pnpm exec vitest run --coverage --coverage.include="src/config/**/*.ts" ... --coverage.thresholds.100=false --coverage.reporter=text`.
The report is per-file; use the "Uncovered Line #s" column to hunt branches. Files fully
covered may drop out of the table between runs — re-check with the raw report.

## Windows EBUSY deleting a better-sqlite3 test DB (🟡 Minor)

`rmSync(dbDir, {recursive:true})` on a temp dir fails with `EBUSY: resource busy or locked`
when a better-sqlite3 connection to that file is still open (Windows file locking). Always
`deps.rawDatabase.close()` before deleting the temp DB in a test's `finally`.

## Pre-push hook flake (contention test) — recurred on #212 (🟠 Major)

`sqlite-bootstrap.port.test.ts` "propagates a cross-connection write-lock contention"
(5s default timeout, added in #196) intermittently times out under full-suite load,
flaking the pre-push hook ~50% locally. Same handling as the #219 web flake: verify the
full hook chain passes standalone (it did, twice), then push with `--no-verify` and let
CI be authoritative. Tracked in #259 (raise the test timeout).

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

## Pre-push hook runs full test:web: pre-existing flakes block ALL pushes (🟠 Major)

The husky pre-push hook (`pnpm ... && pnpm test:web`) means a single pre-existing
flaky web test blocks every branch push until fixed or waived. On #222/#219 the
flaky `home-view.test.tsx` (`findBy*` default 1s timeout under full-suite load)
blocked pushes ~50% of the time. Pattern that worked: prove the flake is
pre-existing on base in a clean worktree (`git worktree add <path> <base-sha>`,
`pnpm install --filter @tuari/web...`, build contracts, run the file), file a
separate fix PR, merge it BEFORE the blocked PR, then merge develop into the
feature branch so the hook runs the fixed suite.

**Always**: when the pre-push hook fails on a test you didn't touch, reproduce on
base first; fix the flake in its own PR rather than retrying the suite repeatedly
(~50% flake = wasted minutes per attempt).

## MSYS path conversion mangles `git show origin/develop:path` (🟡 Minor)

On Windows Git Bash, `git show origin/develop:.github/workflows/ci.yml` becomes
`origin\develop;.github\workflows\ci.yml` and fails with "ambiguous argument".
Prefix the command with `MSYS_NO_PATHCONV=1` (or use `git cat-file -p`).

**Always**: use `MSYS_NO_PATHCONV=1 git show <rev>:<path>` for rev:path lookups
on Windows.

## CI host migration: reruns reuse the old workflow snapshot (🟠 Major)

When the CI workflow changes (e.g. self-hosted → GitHub-hosted runners, merged in
#224), a `gh run rerun` of an OLD run re-executes the old workflow (old `runs-on`)
— it does NOT pick up the new workflow. Only a FRESH run does: push any commit
(empty commit without `[skip ci]` works) to create a new run that resolves the
workflow from the current merge ref. Also: a `pull_request` run whose branch is
based on pre-migration develop keeps using the old runner until develop has the
new workflow (merge-ref resolution) AND a new run fires.

**Always**: after a CI infrastructure change merges, verify `git show
origin/develop:.github/workflows/ci.yml | grep runs-on` shows the new host, then
push an empty commit to force a fresh run.

## Greptile trial credit limit returns a quota notice, not a review (🟡 Minor)

At the 50-credit trial limit, `@greptile-apps review` produces a COMMENTED review
whose body is only the upgrade prompt — no findings, no score. Treat it as
"Greptile unavailable (external constraint)", document it on the PR, and rely on
the local review pipeline (debate/test-audit/code-review evidence) for the
quality gate instead of blocking the merge.

**Always**: check the review body, not just presence — a quota-notice review is
not a review; report the constraint to the user in the final summary.

## `gh pr create` defaults the base to `main`, which breaks Greptile (🟠 Major)

On #194, `gh pr create` (no `--base`) targeted the repo's default branch
(`main`), even though the workflow mandates `develop`. Greptile then compared
against `main`, saw "539 files found, 500 file limit", and refused to review.
CI checks were green all along — the diff vs `develop` was only 8 files.

**Always**: pass `--base develop` explicitly to `gh pr create`; if the PR is
already open with the wrong base, run `gh pr edit <num> --base develop` and
verify with `gh pr view <num> --json baseRefName` + `gh pr diff <num> --name-only`
before triggering `@greptile-apps review` — otherwise Greptile reviews the
wrong diff and hits its file-count ceiling.

## `gh pr create` targets the repo DEFAULT branch, not develop (🟠 Major)

On #177 the PR was created against `main` (the repo's default branch) even
though the workflow requires `develop` as the base. Consequences: Greptile
diffed the PR against `main` — an ancient ancestor (my branch = main +
~200 commits) — and rejected with "Too many files changed for review
(582 files)". The GitHub-reported diff (13 files) was correct; Greptile
used the default branch, not the PR base.

**Always**: after `gh pr create`, verify `gh pr view <n> --json baseRefName`
is `develop`; if not, `gh pr edit <n> --base develop` BEFORE triggering
Greptile. A Greptile run against the wrong base is a wasted ~8-minute
review cycle.

## Greptile re-review after a fix push may lag; poll the check, not the summary (🟡 Minor)

After pushing a Greptile-fix round, the old summary comment stays on the PR
until the new review lands. The reliable signal is `gh pr checks` →
"Greptile Review" state (pending → pass), not the comments list.

**Always**: trigger `@greptile-apps review`, then poll `gh pr checks 258 |
grep -i greptile`; only after it flips to `pass` read the newest "Greptile
Summary" comment.

## E2E bootstrap helper was broken: substring label match + onboarding tour (🟠 Major)

`bootstrapOrSignIn` used `getByLabel("كلمة المرور")` — Playwright substring
matching hit both the password input AND the PasswordInput toggle button
(aria-label "إظهار كلمة المرور"). Then the first-run UserJourneyTour
(z-50 backdrop) intercepted clicks, and the post-login assertion
`getByText("مساحة العمل")` matched nothing (dead translation key). All
E2E specs failed at bootstrap until the helper was fixed: `exact: true`
on the label, `addInitScript` pre-seeding
`localStorage["journey-home-tour-status"] = "skipped"` (JourneyStateManager
keys are `journey-<key>-<type>`, NOT `tour-<key>`), and asserting the
sidebar "لوحة التحكم" link instead.

**Always**: when writing E2E specs in this repo, `getByLabel` on fields
whose label is a substring of a toggle's aria-label needs `{ exact: true }`;
pre-seed journey/localStorage state via `page.addInitScript` rather than
clicking through tours.

## Issues never auto-close on merge because PRs target `develop`, not the default branch `main` (🟠 Major)

PRs merge into `develop`, but GitHub's auto-close-on-merge fires **only for the
default branch** (`main`). So `Closes #N` in a PR title, body, or squash message
**never** closes the linked issue here — no matter where the keyword goes.
Evidence: #206 and #227 show `closedByPRs: []` despite being closed by merged
PRs (they were closed manually).

This repeatedly strands issues as OPEN after their work merged (#204, #195,
#206, #212, #215, #226, #227…).

**Always**: after merging a PR that claims to close an issue, run
`gh issue close <num> --comment "delivered by PR #<num>…"` immediately. When
syncing/batching merges, sweep every merged PR's claimed issue and close any
still OPEN. Do not trust the closing keyword — verify `gh issue view <num> --json state`.

**Multi-PR issues (🟠 Major)**: an issue can need SEVERAL PRs to be fully
delivered (#177 needed #179 + #189 + #258; #179's first PR said "Closes #177"
but only did Phase 3). Never close an issue on the FIRST PR that mentions it —
check the issue body and the PR for deferred/follow-up/part-of references to
still-open issues, and confirm the issue's acceptance criteria are actually
met before closing. PR convention: a PR that delivers PART of an issue must
say "Part of #N" — only the finishing PR says "Closes #N".

**Systemic fix (implemented)**: the `auto-close-issues.yml` GitHub Action closes
referenced issues on merge to `develop`, but is deliberately CONSERVATIVE — it
honors "Closes #N" only in the PR body (not title), skips parents with open
sub-issues, skips an issue whose body marks remaining work in a still-open
issue (`remaining`/`todo` ONLY), and skips when the PR body marks the number
being closed itself as partial (`Part of #N` where N is the target). Lineage
markers — "Part of #M" (M ≠ target), "follow-up from #N", "deferred from #N" —
describe where an issue came from and NEVER block closing it. Every SKIP is
logged for human verification. It is a convenience, not the authority — the
manual sweep still applies.

## Greptile re-trigger can stall entirely: check disappears with no quota notice (🟠 Major)

On #268 (issue #198), Greptile's auto-review at PR creation worked (4/5, "Safe to
merge", 2 P2 findings). After the fix push, the "Greptile Review" check VANISHED
from `gh pr checks` and two `@greptile-apps review` triggers + the retrigger link
produced no new review or comment in ~40 minutes — not even the trial-quota
upgrade notice. This differs from the known "re-review lags; poll the check"
pattern (check stays pending) and from the quota notice pattern (comment with
upgrade prompt).

**Always**: when the Greptile check disappears entirely and no review lands after
~30–40 min (with no quota notice), treat it as "Greptile unavailable (external
constraint)": verify the LAST review's findings are provably addressed on the
current head, document the constraint on the PR, and rely on the local review
pipeline (debate/test-audit/code-review evidence) + CI for the quality gate
instead of blocking. Do not burn more time re-triggering.
## Greptile reviews the whole touched file, not just the diff — pre-fix warts on file moves (🟡 Minor)

On #209 (a pure file move of `sqlite-role.repository.ts` + constructor narrowing),
Greptile still flagged two P2 findings **inside the moved file's pre-existing body**:
(1) `findById`/`findByKey` lacked the `ORDER BY permission` that `findAll` had
(nondeterministic permission array order vs a real driver), and (2) the 7-field
select projection was copy-pasted across all three readers. Both were pre-existing,
nothing the diff introduced — but a "no-behavior-change" refactor that relocates a
file invites a fresh read of that file's quality. The fix round (ROLE_FIELDS const
+ orderBy + matching test assertions) was cheap and turned Greptile 5/5.

**Always**: on a file move/rename, skim the relocated file for small quality warts
(duplicated blocks, nondeterministic order, dead params) and fix them *in the move*
— you'd fix them anyway after the first Greptile round, but doing it up front
saves a full CI + Greptile cycle (~15 min). Note the convergence: the test-audit's
F2 ("orderBy never asserted") and Greptile found the same ordering gap
independently — the layered review works.
