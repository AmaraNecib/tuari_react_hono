---
name: feature-implement
description: "Mandatory lifecycle orchestrator for implementing a local or remote issue. Uses local verification, two-axis code review, test audit, and adversarial debate without requiring a pull request."
---

# Feature Implementation Orchestration

Read `docs/engineering-workflow.md`, `docs/local-issue-status.md` (when the
work is ticket-driven), and `.agents/wisdom/*.md` first.

This repository works against the remote (`AmaraNecib/tuari_react_hono`), so the
source of truth is the current checkout **plus** the GitHub issue/PR state.
Default to the remote workflow: `gh issue`, `gh pr`, `git fetch`, `git push`,
GitHub Actions, and the hosted review gates on the pushed PR.

Use local-only mode **only** when the remote is genuinely unreachable or the
user explicitly asks for it. In that mode the source of truth is the checkout,
local branches/worktrees, `docs/local-issue-snapshot.json`, and cached refs; do
not use `gh issue`, `gh pr`, PR comments, `git fetch`, `git push`, or GitHub
Actions, and stop at a local handoff instead of a PR.

Crew policy: use three concurrent mutation worktrees by default; only the
captain may raise the cap, per batch. The parent may push and open/update a PR
after the gates pass, and merges only under the Merge rules below (never on a
lane's own initiative; a lane never merges at all). After a lane's deliverable
exists (a pushed branch, an opened PR, a reported review), close its Herdr
workspace and preserve the workspace/pane/session identifiers in the handoff;
launch a fresh lane for more work on the same worktree.

## Mode selection and base SHA

At the start of a run:

```bash
git rev-parse --show-toplevel
git status --short --branch
git rev-parse develop
BASE_SHA=$(git merge-base develop HEAD)
```

Use the local `develop` ref as the base when it exists. If it does not, use a
cached `origin/develop` ref without fetching it and record that it is cached.
Never silently use a stale remote ref as if it were live.

Record in the design/review evidence:

- `mode: remote` (default) or `mode: local-only` when the remote is genuinely
  unreachable or the user asked for it
- ticket number/path and ticket source
- target ref and resolved base SHA
- review tier: Lightweight, Standard, or High-assurance

## Enforced lifecycle

### 1. Resolve the ticket (remote first)

In remote mode, read the issue from GitHub (`gh issue view <n> --json
number,title,body,labels,state`) and treat its acceptance criteria as the spec.
In local-only mode, read `docs/local-issue-status.md` and
`docs/local-issue-snapshot.json` instead. Then inspect the named branch, design,
and review evidence. A row marked "Base shipped; local follow-up remains" must be
diffed against the base before replaying anything; do not duplicate a change that
is already present.

If the ticket is only a GitHub URL and has no local description, stop and ask
for the missing requirements. Do not invent acceptance criteria from a title.

### 2. Design before production code

Create or update:

```
.scratch/implementation/<issue-id>-design.md
```

The design must state:

- public APIs, component interfaces, or changed contracts
- dependencies and ownership boundaries
- planned unit/integration tests and Playwright E2E tests where applicable
- implementation risks, migration concerns, and local-only constraints
- the fixed base SHA and review tier

Reference `docs/local-issue-status.md` when an issue is a local snapshot rather
than a live issue file.

### 3. Implement with tests

Load the `implement` skill and use `TDD` at the agreed seams. Every user-facing
feature includes a Playwright test in `tests/e2e/`; business logic includes
unit/integration tests. During implementation run the relevant checks, normally:

```bash
pnpm typecheck
pnpm test:web
pnpm test:api
```

For Rust Core changes also run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings
```

Run output-heavy checks here and in Guard Phase 1 through a `codemode` script
(see `AGENTS.md` → *Context discipline (codemode)*) so raw test logs, `pnpm`/
`gh` output, and multi-file reads are filtered before they reach the context.

### Source-only staging rule

Builds and test commands may generate `dist/`, `target/`, sidecar binaries,
Tauri schemas, coverage, Playwright reports, or other ignored artifacts. Those
are never part of a source change. Before committing or pushing a local PR,
inspect the exact file set:

```bash
git diff --name-only <base-sha>...HEAD
git status --short --ignored
```

Stage named source/config/test/evidence files only. Never use `git add -A` and
never add generated output merely because a build produced it. If a legacy
tracked generated file appears in the base, document it; do not copy or add a
new generated version to the feature branch.

### 4. Guard Phase 1: pre-review

Run `guard` Phase 1 before any review. In local-only mode it means local
commands only:

```bash
pnpm --filter @tuari/contracts build
pnpm typecheck
pnpm lint
pnpm test:api
pnpm test:web
```

Do not proceed while a required local check fails. If a failure is unrelated,
prove it on the base and document the waiver rather than hiding it.

### 5. Quality check

**First, the design pass — mandatory on the work this PR did, and it is a merge
gate.** Run **`domain-modeling`**, **`codebase-design`** and
**`improve-codebase-architecture`** against this PR's diff, not only the new
modules in it: does it use the domain's vocabulary and state new rules once; is
anything it added shallow (the deletion test); is each seam real or hypothetical;
what friction did it create?

**It is incremental.** Fix what this diff made worse plus the cheap cleanups it
exposes — a deleted duplicate, a rule single-sourced, a seam moved where it
belongs. A finding whose fix would sprawl belongs in its own issue, filed with the
finding: a feature PR must not become a refactor. The bar is that the codebase is
never left worse than this PR found it — a PR that would leave the codebase harder
to change does not merge "and get cleaned up later": the mess compounds. See
`docs/engineering-workflow.md` §5.

Record the outcome in `.scratch/reviews/<issue-id>/<HEAD>-design-pass.md`
(the filename must contain the reviewed HEAD SHA), including "nothing found" —
silence is not evidence the pass ran. The same three skills run over the
**whole** codebase periodically (#451), not per PR; for a large change, run both.

Then load only the skills relevant to the change:

| Change | Skill |
| --- | --- |
| New module, interface, or architecture | `codebase-design` |
| Complex logic or edge cases | `diagnosing-bugs` |
| Domain entities or terminology | `domain-modeling` |
| Writing tests | `TDD` |
| Production code | `code-review` |
| UI or visual design | `frontend-design`, `web-design-guidelines` |
| Existing UI polish | `redesign-existing-projects` |
| shadcn/ui | `shadcn` |
| Component API/prop design | `vercel-composition-patterns` |
| React rendering performance | `vercel-react-best-practices` |
| Tauri IPC/window/runtime | `tauri-v2` |
| Hono routes/middleware/validation | `hono` |
| Playwright tests | `playwright-best-practices` |
| Accessibility/keyboard/RTL | `accessibility` |

### 6. Debate: Standard and High-assurance

Run `debate` against the fixed base SHA for any Standard or High-assurance
change — anything that alters behaviour. Skip it only for Lightweight work.
Save the result as `.scratch/reviews/<issue-id>/<HEAD>-debate.md`.

### 7. Test audit: Standard and High-assurance

Run `test-audit` for Standard and High-assurance work. It must check edge
cases, meaningful assertions, failure/empty states, and E2E coverage. Save
`.scratch/reviews/<issue-id>/<HEAD>-test-audit.md`.

### 8. Local code review

Run `code-review` against the pinned local base:

```bash
git diff <base-sha>...HEAD
git log <base-sha>..HEAD --oneline
```

The Standards and Spec axes must use local designs/specs and
`docs/local-issue-status.md`; they must not attempt to fetch GitHub issue or PR
content. Save `.scratch/reviews/<issue-id>/<HEAD>-code-review.md`.

Fix actionable findings, rerun the local checks, and regenerate evidence after
any reviewable-file change. Review findings are claims: verify each against
current code before fixing. If a finding appears outside scope, ask
the parent before deferring it; include the proposed follow-up, dependency
impact, and whether it should change the current lane/worktree order.

### 9. Guard Phase 2: local pre-report gate

Run `guard` Phase 2. Verify local checks, review evidence freshness, and that
the branch is in a reportable state. A clean working tree is preferred; if the
user wants an uncommitted local handoff, report every uncommitted file and do
not claim the work is ready to integrate.

Evidence filenames must contain the final reviewed `HEAD` SHA; evidence-only
follow-up commits require a freshness check and a post-evidence note.

### 10. Local review on the pushed head (Greptile replaced)

**Greptile is not part of the gate.** The CLI is unavailable (`access_denied`) and
the hosted review is out of quota, so nothing may depend on it and its absence is
not a gap to report. This step is the local review skills instead:

- **`debate`** — critic and defender in fresh context, then synthesize. Run it on
  every Standard and High-assurance change — anything that alters behaviour. It
  is not High-assurance-only; skip it only for Lightweight work.
- **`code-review`** — Standards (does it follow the repo's rules?) and Spec (does
  it do what the issue asked?), in parallel fresh contexts.
- **`test-audit`** — do the tests prove the behaviour, and would they fail if the
  fix were reverted?

Fix every high and medium finding, and the lows unless provably wrong; a dismissal
must cite the code path or test that disproves it. Prove each behaviour fix with a
test that fails on the pre-fix code. **A verdict on an earlier commit does not
count** — the review must be on the pushed head, because that is the commit the
merge would ship.

Run the three skills in fresh context. Save each result under
`.scratch/reviews/<issue-id>/`, with the reviewed HEAD SHA in the filename:

```
.scratch/reviews/<issue-id>/<HEAD>-debate.md
.scratch/reviews/<issue-id>/<HEAD>-code-review.md
.scratch/reviews/<issue-id>/<HEAD>-test-audit.md
```

The gate is clean only when all three are current for the final HEAD and report
no unresolved/actionable findings. Check the current code before dismissing a
false positive, and regenerate the evidence after any reviewable change.

### 11. Guard Phase 3, then the remote loop

**Phase 3a — local gate, before any push.** All of these must hold:

- contracts/typecheck/lint/API/web/Rust checks are green as applicable
- code-review, test-audit, and debate evidence is present, current **on the
  final local HEAD**, and clean
- deferred work has an explicit parent decision; lanes never defer silently

**Phase 3b — the remote loop, in this order.** Hosted CI cannot exist before the
PR does, so it is verified here, not in the pre-push gate:

1. Push the branch (`git push origin <branch>`) with explicit staging.
2. Open or update the PR with the issue link (`Closes #N` only when the whole
   issue ships; `Part of #N` otherwise) and the evidence summary. After opening
   it, publish a concise review-evidence summary as a PR comment: the commands
   that were run and their **results inline**, because a reviewer cannot open the
   gitignored `.scratch/` files from the PR. Cite `.scratch/` paths only as a
   secondary pointer for the local operator. **Update that comment whenever a
   later push changes what was verified** — a stale evidence comment is worse
   than none.
3. Wait for the hosted CI checks on the pushed head; re-run flaky
   infrastructure jobs rather than changing unrelated code.
4. Re-run `debate`, `code-review` and `test-audit` on the pushed head and update
   the evidence. The local review is the review of record; there is no hosted
   review to request or poll.
5. Repeat 3-4 until CI is green on the current head and the local review
   evidence is current and clean.
6. Report the PR URL, the check states, and the local review verdicts, then
   stop. A **lane** never merges. The **parent** merges only under the Merge
   rules below — never on a lane's own initiative.

In **local-only mode**, report the local state and stop; do not wait for CI or
PR state.

### 12. Capture wisdom and report

Run `capture-wisdom` for any durable lesson. Report:

- ticket and local branch/worktree
- base SHA and final HEAD SHA
- checks run and their results
- local review verdicts (debate, code-review, test-audit) and any re-review iterations
- evidence paths
- deferred items and whether they are shipped, local-only, or unverified

## Merge rules

The **parent** may merge a PR only when every one of these holds:

1. The user has authorized merging — an explicit "merge it", or a standing
   instruction such as "merge when CI is green and the local reviews are clean".
   Absent that, report and stop.
2. Every required CI check is green **on the pushed head**.
3. `debate`, `code-review` and `test-audit` are clean **on that same head**. A
   verdict on an older commit does not count — check the reviewed SHA against
   `headRefOid`, and re-run the reviews after each push.
4. No blocker remains (unresolved finding, failing gate, unknown deferral).

```bash
gh pr merge <num> --squash
```

A **lane never merges**, under any score. If a condition fails, report the exact
state instead of merging.

## Where to start (resume table)

| State | Start at |
| --- | --- |
| Nothing exists | Read `docs/engineering-workflow.md` + `.agents/wisdom/*.md` |
| No design doc | Step 2 — design |
| Code not written | Step 3 — implement |
| Guard Phase 1 not run | Step 4 |
| No quality check / debate / test audit | Steps 5–7 |
| No code review | Step 8 |
| Guard Phase 2 not run | Step 9 |
| Not pushed, or PR not opened/updated | Step 10 |
| Local review findings unresolved | Step 10 (local review gate) |
| CI red, or local review evidence stale on the head | Step 11 |
| All green and reviews clean | Step 12 (capture wisdom + report) → Merge rules (parent only) |

## Local-only completion rules

A local implementation is ready for later integration, not merged, only when the gates above pass, the review evidence is current and clean, and the working tree state is reported accurately.

Never claim an issue is closed or merged while GitHub is unavailable. When the
remote is restored, rebase/compare against the fresh `develop`, rerun all local
checks and the local reviews, then push/open or update the remote PR only with
the user's approval. In local-only mode nothing is merged; once the remote is
restored, the remote loop and the Merge rules below apply.

## Review tiers

| Tier | Applies to | Required review |
| --- | --- | --- |
| Lightweight | Truly non-reviewable files only | Guard Phase 1 → quality check → report |
| Standard | Code, tests, CI, workflow, config, UI, API, skills | Guard Phase 1 → quality check → design pass → debate → test-audit → code-review → Guard Phase 2 → Guard Phase 3 |
| High-assurance | Authz/RBAC, licensing/crypto, financial calculations, security | Standard, with the strictest reading of every finding |

