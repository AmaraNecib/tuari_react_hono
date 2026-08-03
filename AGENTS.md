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
- Distill durable lessons into `.agents/wisdom/*.md` (via capture-wisdom) or `docs/lessons/` — those are read at session start and persist.

## Engineering workflow

Follow `docs/engineering-workflow.md` and the `feature-implement` skill for all code changes.
Read `.agents/wisdom/*.md` before starting a session.
