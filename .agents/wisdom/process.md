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

## Pre-push hook runs the full suite and flakes on pre-existing tests — verify standalone, fix the flake in its own PR (🟠 Major)

The husky pre-push hook (`contracts build && typecheck && lint && test:api && test:web`)
re-runs the ENTIRE pipeline, so a single pre-existing flaky test blocks every push
until fixed or waived. Known instances: `home-view.test.tsx` (findBy*/timing flakes
under full-suite load, #206/#219/#222, ~50%), `sqlite-bootstrap.port.test.ts`
cross-connection write-lock contention (5s timeout, #196/#212/#259), and
`navigateMock` timing right after a multi-PR merge (see the wisdom-conflict entry).

**Always**: when the pre-push hook fails on a test you didn't touch:
1. Confirm the suite passes standalone (target file, then the full chain if cheap).
2. Prove the flake is pre-existing on base in a clean worktree
   (`git worktree add <path> <base-sha>`, install, build contracts, run the file).
3. Prefer fixing the flake in its OWN PR, merged before the blocked PR; otherwise
   push with `--no-verify` and let CI (hosted runners, same jobs) be authoritative.
   Document the waiver to the user. Never retry the suite repeatedly (~50% flake =
   wasted minutes per attempt).

## Greptile (external review bot) — how to drive it reliably (🟠 Major)

`@greptile-apps review` re-triggers after a fix push. Reliable driving rules:

- **Base branch first**: `gh pr create` defaults to the repo DEFAULT branch
  (`main`), not `develop` — Greptile then diffs the wrong base, inflates file
  counts (539/682 files), and hits its 500-file ceiling. Always pass
  `--base develop`; fix an open PR with `gh pr edit <n> --base develop` and
  verify `gh pr view <n> --json baseRefName` before re-triggering (#194, #300).
- **Presence, not score**: read the inline comment (score + "Files Needing
  Attention") even when the check is green; a trial-quota review has only the
  upgrade prompt — treat as "Greptile unavailable", document on the PR, rely on
  the local review pipeline (debate/test-audit/code-review evidence).
- **Poll the check, not the comments**: after a fix push the old summary stays
  until the new review lands — watch `gh pr checks` "Greptile Review" state
  (pending → pass), then read the newest summary (#258).
- **Re-trigger after workflow/docs pushes**: `.github/workflows/`, `.agents/`,
  `docs/` commits are reviewable — a ci.yml push makes the prior review stale;
  re-trigger before the pre-report gate (#206).
- **It can stall entirely**: the check can VANISH (not pending, not quota) with
  no review in ~30–40 min — treat as "Greptile unavailable"; verify the last
  review's findings are addressed, document the constraint, rely on local
  evidence (#268).
- **Whole-file review**: Greptile reviews the whole touched file, not just the
  diff — on a move/rename, skim the relocated file for pre-existing warts
  (duplicated blocks, nondeterministic order) and fix them in the move (#209).

## Run git add/commit from the worktree root, never from nested scratch dirs (🟠 Major)

On #206, `cd ../..` from `.scratch/reviews/206` landed in `.scratch/`, so `git add .scratch/` staged nothing and the commit printed a confusing "On branch ci/github-hosted-runners" status (the pre-commit hook's pnpm workspace resolution surfaced the main worktree's branch). The evidence-rename commit appeared to fail and had to be re-done from the worktree root.

**Always**: `cd` to the worktree root before any `git add`/`git commit`/`git status`; verify `git status --short` shows exactly what you intend to stage.

## CI migrated to GitHub-hosted runners — self-hosted runs are dead (🟠 Major)

The self-hosted runner was retired; ci.yml now runs on ubuntu-latest (migrated via PR #224). Runs queued on the old workflow either fail on infra (e.g. `test:coverage` exit 1 with local pass) or queue forever. If your branch's ci.yml still says `runs-on: self-hosted`, align it with the merged migration (copy `origin/develop`'s ci.yml) or merge develop in.

**Always**: after a "CI host changed" notice, check `git diff HEAD origin/develop -- .github/workflows/ci.yml` and verify the PR's workflow matches the migrated one; when an old-runner run fails but the same command passes locally, cancel/re-run on the new workflow rather than debugging the code.

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

## Verify assigned ownership paths against the repo before launching worktree agents (🟠 Major)

Running four issues in parallel (one subagent per worktree) with an exclusive
file-ownership map: the map assigned #286 → `apps/api/src/modules/chunk/` and
#274 → `apps/api/src/auth/` — **neither directory exists**. #286's real scope was
`apps/web` (home-view + sections + vite.config.ts manualChunks); #274's real fix
was `apps/web/package.json` + `pnpm-lock.yaml`. I remapped both to the actual
issue scope in each task text and documented the deviation to the user. Result:
all three implemented PRs (#295 rbac, #296 body-limit, #300 web-perf) stayed
strictly inside their owned paths, squash-merged onto develop with ZERO conflicts
in sequence — disjoint ownership is what makes parallel worktrees conflict-free.

**Always**: before spawning per-worktree agents, `ls`/`find` the assigned paths
and verify they match the issue's real scope; when they don't, remap to the
issue scope (documenting the change) instead of blindly passing the map through.
Never let two agents share a path; merge in dependency order and re-check
mergeability after each squash.


## Whole-issue fix landing in forbidden files → the run is report-only by design (🟡 Minor)

#274's entire fix (bump `apps/web/package.json` to `better-auth@^1.6.20`, dedupe
`pnpm-lock.yaml`, root `pnpm.overrides` for tar) lived in parent-owned files that
agents may never edit. The agent ran the diagnosis stage only (read-only
`pnpm why`/`pnpm audit`, no install) and stopped with a per-file change list.
That report-only run was still high-value: it surfaced a **NEW critical** the
issue didn't know about (`seroval ≤1.5.2` via `@tanstack/router-core`,
GHSA-mv8w-475r-vwqw) and a severity downgrade in the current advisory DB.

**Always**: when an issue's fix is entirely forbidden-file territory, dispatch a
diagnosis-only run (read-only commands, no installs — `pnpm install` rewrites
the forbidden lockfile) and require it to return the exact per-file diff needed.
Don't let it open a PR or make partial non-forbidden changes that don't advance
the issue.


## Orphaned pi agent processes from earlier sessions eat GBs of RAM and cause OOM mid-batch (🟠 Major)

The 5-worktree parallel run (#273/#276/#279/#280/#283) hit `spawn ENOMEM`
and killed runs because the machine had 0.5 GB free of 31.8 GB. Root cause:
two `pi-coding-agent` node processes created ~4.5h EARLIER (the previous
parallel run's session) were still alive holding ~7.9 GB and ~7.6 GB
respectively — orphaned runners nobody reaped. Plus the live session (~4.3
GB) and 5 subagents with 125–166k-token contexts running vitest/playwright/
cargo simultaneously.

**Always**: before launching a parallel worktree batch, list leftover
`pi-coding-agent` node processes and kill ONLY ones you can positively
identify as dead-session orphans — never by age alone (another ACTIVE
session's runners can legitimately be older than yours). For each candidate
process: (1) walk its parent `pi.exe`/shell chain and the session file path
embedded in its command line to find its owning session, (2) confirm that
session is no longer active — its async-run `status.json` shows a terminal
state (complete/failed/stopped) with no recent `lastActivityAt`, and (3)
check it has no live activity (recent tool/bash child, growing output log).
Kill only after all three hold. Expect long async runs to be killed (exit
-1) or fail to spawn (ENOMEM) under memory pressure; runs are resumable
from persisted sessions and worktree state survives, so resume rather than
restart.


## Async subagent runs killed mid-flight are resumable — verify worktree state, then resume (🟠 Major)

All 5 async runs in the batch died once (or twice) with exit code
4294967295 (signal kill) ~35 min in, all within ~100 ms of each other — a
coordinated runner kill, NOT a natural failure. The run status says
`failed` with `resumeDisposition: resumable`. Worktree changes were intact;
resuming each run from its persisted session continued implementation,
reviews, push, PR, CI and Greptile correctly. One resume then crashed with
a Windows exception (0xC0000409) right after an edit — resume AGAIN from
the same session; the uncommitted edit was still there.

**Always**: when a subagent run reports `failed` but the session is
resumable, inspect the worktree state first (uncommitted changes intact?)
and branch/PR state, then resume with a precise "resume exactly where you
left off" message listing the known commits/uncommitted files. Do not treat
a killed run as a lost run.


## Conflicted main-repo package.json breaks vitest in ALL worktrees (🟠 Major)

The main checkout had a stash-merge conflict in `package.json` + `pnpm-lock.yaml`
(UU, `<<<<<<< Updated upstream` markers). esbuild bundles vitest.config.ts by
walking UP past the worktree root to the main repo's package.json, so EVERY
`pnpm --filter @tuari/web test` in any worktree failed with "Expected string
in JSON but found '<<'". The worktree agents correctly refused to touch the
parent-owned file and escalated.

**Always**: before parallel worktree runs, verify the main repo is clean
(`git status --short` shows no UU/conflict markers) — a conflicted
package.json/lockfile poisons esbuild resolution for every worktree. Fix on
the parent side (resolve to HEAD/develop), then have agents retry.


## Ownership extension mid-flight: agent asks supervisor, parent cross-checks (🟡 Minor)

#276's Greptile round 2 surfaced a real regression (reset mutation not
invalidating the snapshot) that required editing
`apps/web/src/features/app-shell/workspace-mutations.ts` — OUTSIDE its
announced owned paths. The agent stopped and asked via contact_supervisor
instead of silently editing. The parent checked the other 4 agents'
ownership lists (no one owned it), approved, and the fix landed cleanly.

**Always**: when a fix needs a file outside announced ownership, STOP and
ask the parent (contact_supervisor, reason need_decision) with the exact
file + why. Parent: cross-check the OTHER agents' announced lists before
approving; the owner is whoever needs it, not the first to claim.

## Sibling-worktree dev servers squat the fixed Playwright ports and fake a green e2e run (🟠 Major)

On #278 the local full Playwright suite failed 9 specs at `bootstrapOrSignIn` —
every one a `page.goto` timeout — minutes after the SAME new spec passed
standalone. Root cause: another worktree (`issue-287-splashscreen`) was running
its own Playwright suite CONCURRENTLY, and its API/web dev servers held the
hardcoded ports 4318/3000. `reuseExistingServer: false` does NOT pre-check the
port — the stale server answered `/health` ok, so our run connected to
issue-287's DB/modules instead of spawning its own. Diagnosis path:
`Get-NetTCPConnection -LocalPort 4318,3000 -State Listen` showed a foreign
worktree's PIDs; `Get-CimInstance Win32_Process` showed an ACTIVE
`npx playwright test` from that worktree — so the servers were NOT orphans to
kill (another agent's live run), just squatters. Re-ran the full suite when the
ports freed → 24 passed / 2 skipped.

**Always**: before a local e2e run, check WHO owns ports 4318/3000 (not just
that they're free) — if another worktree's process holds them, wait for that
run or coordinate; never kill a process belonging to an active sibling session.
And when a batch of specs fails identically at `page.goto`, suspect infra
(port squatters / stale servers), not the diff — re-run with clean ports before
trusting the failures.


## A CSS/DOM selector mismatch can make an a11y fix a user trap (🟠 Major)

Issue #284's "mobile sidebar can't be dismissed" turned out to be worse than
described: the `<div data-tour="sidebar">` wrapper around `<WorkspaceSidebar/>`
broke EVERY `.tauri-shell > aside` selector (mobile drawer overlay, `aside + div`
main-area grid, print/4K rules). The drawer never overlaid (aside stayed a static
52.5px sliver), but `.tauri-shell::after` (on the shell itself) DID match — so
opening the drawer on mobile showed a z-39 backdrop with `pointer-events: auto`
and NO click handler, covering the header toggle. The user was trapped on mobile.
Also `data-collapsed="true"` (specificity 0,2,0) beat the mobile `.tauri-shell`
`grid-template-columns: 1fr` (0,1,0), keeping the mobile grid at 52.5px + 1fr.

**Always**: when the issue says "X can't be dismissed/closed", verify the DOM
matches the CSS selectors before trusting that the control renders at all — a
wrapper div inserted for a tour target or analytics hook can silently sever the
selector chain, and the "can't dismiss" symptom is often a full trap. Test at the
actual mobile viewport (Playwright + computed styles), not just the unit level.
Check attribute-selector specificity fights between persisted state
(`data-collapsed`) and media-query overrides.

## Parallel worktree PRs collide on `.agents/wisdom/*.md` — resolve by keeping BOTH sides (🟠 Major)

On the 2026-08-10 batch (9 parallel worktrees merged sequentially), the
second and third merges each hit a CONTENT conflict in a wisdom file —
`testing.md` (between #278's toMatchObject-array lesson and #320's
no-op-rekey lesson) then `process.md` (between #278's sibling-worktree
port-squatter lesson and #284's CSS-selector lesson). Every agent in a batch
appends lessons to the same files, so the Nth squash merge into develop is
expected to conflict on `.agents/wisdom/*`.

**Always**: when a wisdom file conflicts on merge, treat the two sides as
independent durable lessons and keep BOTH — splice them side by side, never
delete either section. Expect this on any batch with ≥2 worktrees and resolve
it like a normal code conflict (fix → push → wait for CI → merge). Also: the
pre-push hook runs the full web suite, which can flake on `navigateMock`
timing under load right after a multi-PR merge — re-run before blaming the diff.

## Auto-close action ignores PR titles — "closes #N" must be in the PR BODY (🟠 Major)

On the same batch, TWO issues stayed OPEN after their PRs merged because the
closing reference lived only in the PR TITLE: #282 (PR #311 titled
"...(closes #282)") and #278 (PR #318 titled "...(#278)"). The auto-close
action parses the BODY by design (docs/lessons/gh-pr-merge-squash-issue-close.md).
The squash commit subject can carry "(closes #N)" for history, but the BODY
needs the keyword too.

**Always**: when creating a PR, put "closes #N" (or "Part of #N") in the
BODY, not just the title. After ANY merge batch, verify every referenced
issue: `gh issue view <n> --json state` and close manually with a comment if
still OPEN — do not trust the title.




## Review process: Greptile verification, adversarial review, CodeRabbit

**Greptile findings are claims, not truth**: verify each against the current
code before fixing — grep the file for the claimed usage; dismiss invalid
findings with a line-number citation in a PR comment, never silently. On a pure
file move, an import is only stale in a file where EVERY helper that referenced
the type moved out (#202). The score is not evidence: Greptile can emit a high
score with inline findings — the clean state is a 5/5 summary with ZERO inline
threads; check `gh api repos/<o>/<r>/pulls/<n>/comments` (review threads
endpoint) before calling a PR ready.

**Adversarial review (debate critic/defender)**: when a finding says "duplicate
check", grep the WHOLE repo for the pattern before fixing one copy — "local
host" existed as `isLocalhostHostname` in the transport layer beyond
`config/index.ts` + `env.ts`; route every check through the shared helper.

**CodeRabbit** (incremental): a re-review EDITS its existing comment (same id),
it does not post a new one; "already reviewed, review finished" = no meaningful
change. Read existing comments first — re-trigger only when the latest commit
changes reviewable code (Rust/TS/tests — NOT docs, config, .coderabbit.yaml),
when it's stuck >10 min, or when unsure. Freshness: compare the review comment's
createdAt vs the latest commit's committedDate. An "Outdated" badge does NOT
mean fixed — read the current code. `⚠️ Warning` = advisory (mergeable; document
why in the PR), `❌ Failed` = blocker.