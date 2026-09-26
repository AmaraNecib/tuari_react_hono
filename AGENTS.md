# Agent Guidelines

Rules for AI agents working in this repository. Read this before making changes.

## Commit staging discipline

**Never run `git add -A` or `git add .`.** Stage files explicitly so scratch/review
noise never leaks into commits.

### What belongs in a commit

- Source code changes (`apps/`, `packages/`, `scripts/`, `infrastructure/`)
- Tests
- Config that affects the build or runtime (`.github/workflows/`, `tsconfig*`, `vitest.config.*`, `playwright.config.ts`)
- The design doc for the current issue: `.scratch/implementation/<issue-id>-design.md`
- Review evidence for the current issue: `.scratch/reviews/<issue-id>/`

### What never gets committed

- `.scratch/sessions/` — daily session logs (gitignored)
- `.scratch/issues/` — backlog files (migrated to GitHub issues, gitignored)
- `/tmp/*`, worktree directories, local DB files
- Any `.scratch` file NOT related to the current issue being implemented

### Example

```bash
git add apps/api/src/modules/my-module/  packages/contracts/src/my-contract.ts
git add .scratch/implementation/215-design.md
git add .scratch/reviews/215/
git commit -m "..."
```

## Scratch lifecycle

- `.scratch/implementation/<issue-id>-design.md` — decision record, **keep committed** (it captures *why*).
- `.scratch/reviews/<issue-id>/` — review evidence, **keep committed while the PR is open** (the guard skill checks evidence SHAs against HEAD). After the PR merges and the issue closes, the review files may be cleaned up.
- Distill durable lessons into `.agents/wisdom/*.md` (via capture-wisdom) — the ONE agent-facing store; `docs/lessons/` holds only human-facing rationale docs (e.g. gh-pr-merge-squash-issue-close.md). Agents grep wisdom, not lessons.

## Engineering workflow

Follow `docs/engineering-workflow.md` and the `feature-implement` skill for all code changes.
Read `.agents/wisdom/*.md` before starting a session.

## Crew dispatch shape (parallel lanes)

When running parallel agent lanes (the crew-dispatch skill), the default shape
is VISIBLE agents — one Herdr workspace per lane, one live agent session per
worktree — whenever the captain is present and the lanes mutate code. Headless
children are only for read-only scouts/probes, or with the captain's explicit
opt-in. An explicit captain instruction like "don't use herdr" / "run
headless" always wins. Never let "run-to-completion" silently become
"invisible".

**Launching a lane goes through `scripts/crew/launch-lane.mjs`** — it is the
only sanctioned launcher (workers and reviewers alike). If you are starting a
lane without it, you are not doing crew dispatch.

### Crew concurrency and landing policy

- Use **six concurrent mutation lanes/worktrees by default**. The captain may
  explicitly choose another positive cap for a batch; otherwise queue
  additional work until a lane is handed off and its Herdr workspace is closed.
- A lane may implement, validate, and report. The parent owns pushing and
  creating PRs; a lane must never merge anything.
- A lane may propose deferring out-of-scope work to a follow-up PR, but it must
  ask the parent first with the exact finding, scope, dependency, and proposed
  destination. The parent decides whether to fix it in the current PR, defer
  it, or reorder/queue other worktrees. No silent deferrals.
- **Never merge a PR from crew automation, even after a 5/5 review.** A 5/5
  result authorizes at most opening/updating the PR and stopping. Merge is not a
  crew deliverable.
- After the parent receives a lane handoff, close a Herdr workspace only when
  the lane is terminal and no follow-up work is expected. Keep a lane alive when
  the parent will send another task; do not stop it just because the first
  handoff arrived. If closing is useful, preserve the workspace/pane/session
  identifiers in the handoff so the lane can be reopened or resumed later.

## Issue-closing convention (multi-PR issues)

An issue may need several PRs to be fully delivered. Never claim an issue is
closed unless ALL of its scope is actually shipped:

- A PR that delivers PART of an issue must say **`Part of #N`** in the body.
- Only the PR that finishes the issue says **`Closes #N` / `Fixes #N`**.
- Never put `(closes #N)` in a PR **title** — the body is the source of truth
  (the auto-close action ignores titles by design).
- Before closing an issue, check its body + the PR for `defer`/`follow-up`/
  `part of`/`remaining` references to still-OPEN issues, and verify the
  acceptance criteria in the code — not just the PR claim.
- After any merge, verify: `gh issue view <num> --json state` and close manually
  if still OPEN.

See `docs/lessons/gh-pr-merge-squash-issue-close.md` for the full rationale.
