---
name: feature-implement
description: "Mandatory lifecycle orchestrator for implementing a local or remote issue. Uses local verification, code review, Greptile CLI review, and the local Greploop loop without requiring a pull request."
---

# Feature Implementation Orchestration

Read `docs/engineering-workflow.md`, `docs/local-issue-status.md` (when the
work is ticket-driven), and `.agents/wisdom/*.md` first.

This repository currently runs in **local-only mode** because the GitHub
repository is unavailable. The source of truth is the current checkout,
local branches/worktrees, `docs/local-issue-snapshot.json`, and the cached
Git refs. Do not use `gh issue`, `gh pr`, PR comments, `git fetch`, `git push`,
or GitHub Actions until the user explicitly says the remote repository is
available again.

Crew policy: use at most six concurrent mutation worktrees. The parent may push
and open/update a PR after the gates pass, but **must never merge**, even after
Greptile reports 5/5. Close a Herdr workspace only when its lane is terminal
and no follow-up is expected; keep reusable lanes alive and preserve
workspace/pane/session identifiers before closing.

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

Load only the skills relevant to the change:

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

### 6. Debate: High-assurance only

For High-assurance work, run `debate` against the fixed base SHA. Save the
result as `.scratch/reviews/<issue-id>/<HEAD>-debate.md`.

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
any reviewable-file change. Greptile findings are claims: verify each against
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

### 10. Greptile review: CLI locally, hosted on the PR

Use both, in this order:

1. Before pushing, run the CLI against the pinned base so findings are cheap to
   fix in the checkout:

```bash
greptile whoami
greptile review --json --branch <base-branch>
```

Pass the pinned base branch/ref; omitting it can compare against the repository
default branch and review an unrelated, enormous diff. If the issue needs an
iterative fix loop, run `greploop --local` after the first review. Re-run the
local checks after every code fix.

2. After pushing, the hosted review runs on the PR. Read its score and **every**
   finding from the PR — the summary comment and the inline review comments are
   different endpoints:

```bash
gh pr view <n> --json comments                     # summary + confidence score
gh api repos/{owner}/{repo}/pulls/<n>/comments \  # inline, file-level findings
  --paginate --jq '.[] | "[\(.path):\(.line // .original_line)] \(.body)"'
```

   Fix real findings with a new commit, request a fresh review, and never claim
   a clean verdict from a stale one: match the reviewed commit to the current
   head.

Save the raw CLI result and a concise summary under:

```
.scratch/reviews/<issue-id>/<HEAD>-greptile-local.json
.scratch/reviews/<issue-id>/<HEAD>-greptile-local.md
```

The local Greptile gate passes only when the latest result is clean: confidence
5/5 with zero unresolved/actionable findings, or an equivalent CLI result that
explicitly reports no actionable findings. A successful command by itself is
not a clean verdict.

### 11. Guard Phase 3, then the remote loop

**Phase 3a — local gate, before any push.** All of these must hold:

- contracts/typecheck/lint/API/web/Rust checks are green as applicable
- code-review, test-audit, and debate evidence is present and current
- the CLI Greptile result is clean **on the final local HEAD**
- deferred work has an explicit parent decision; lanes never defer silently

**Phase 3b — the remote loop, in this order.** Hosted CI and the hosted review
cannot exist before the PR does, so they are verified here, not in the pre-push
gate:

1. Push the branch (`git push origin <branch>`) with explicit staging.
2. Open or update the PR with the issue link (`Closes #N` only when the whole
   issue ships; `Part of #N` otherwise) and the evidence summary.
3. Wait for the hosted CI checks on the pushed head; re-run flaky
   infrastructure jobs rather than changing unrelated code.
4. Read the hosted review on that head — summary **and** inline findings:

```bash
gh pr view <n> --json comments                     # review summary + score
gh api repos/{owner}/{repo}/pulls/<n>/comments \  # inline, file-level findings
  --paginate --jq '.[] | "[\(.path):\(.line // .original_line)] \(.body)"'
```

5. Match the review's "Last reviewed commit" to the current head. After every
   fix push, request a fresh review (`@greptile-apps review`) and wait for the
   new verdict — an automatic review runs on PR creation, later commits need
   the request.
6. Repeat 3-5 until CI is green and the review on the current head is clean.
7. Report the PR URL, the check states, and the Greptile score, then stop.
   **Never merge** — the parent owns the merge decision.

In **local-only mode**, report the local state and stop; do not wait for CI or
PR state.

### 12. Capture wisdom and report

Run `capture-wisdom` for any durable lesson. Report:

- ticket and local branch/worktree
- base SHA and final HEAD SHA
- checks run and their results
- local Greptile confidence/findings and loop iterations
- evidence paths
- deferred items and whether they are shipped, local-only, or unverified

## Local-only completion rules

A local implementation is ready for later integration, not merged, only when the gates above pass, the review evidence is current, the latest Greptile result is clean, and the working tree state is reported accurately.

Never claim an issue is closed or merged while GitHub is unavailable. When the
remote is restored, rebase/compare against the fresh `develop`, rerun all local
checks and Greptile review, then push/open or update the remote PR only with the
user's approval. Stop after the PR is created or updated; never merge it.

## Review tiers

| Tier | Applies to | Required review |
| --- | --- | --- |
| Lightweight | Truly non-reviewable files only | Guard Phase 1 → quality check → report |
| Standard | Code, tests, CI, workflow, config, UI, API, skills | Guard Phase 1 → quality check → test-audit → code-review → Guard Phase 2 → CLI Greptile → Guard Phase 3 |
| High-assurance | Authz/RBAC, licensing/crypto, financial calculations, security | Standard plus debate |

