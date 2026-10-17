# Agent Guidelines

Rules for AI agents working in this repository. Read this before making changes.

## Context discipline (codemode)

Tool output is what fills an agent's context with noise: test logs, `gh` and
`pnpm` output, greps, several file reads at once, PowerShell queries. For that
work, prefer a `codemode` script over a bare `bash` call. The script calls
`tools.bash` / `tools.read` and prints only the lines that matter, so the raw
output never enters the context. A bare `bash` call is still right for one short
command whose whole output you actually want.

- `tools.bash({ command })` resolves to `{ output, truncated, full_output_path?, exit_code, wall_time_seconds }`. Its `output` holds up to 1 MiB, against the 2000 lines / 50 KB a bare `bash` result shows, so run the command in a script and print the summary.
- `tools.read({ path })` returns the file's text (an image file comes back as an image block). Run independent calls in parallel with `Promise.all` / `Promise.allSettled`.
- `text(value)` and a top-level `return` add output; `// @options: {"max_output_tokens": N, "timeout_ms": N}` must be the script's first line.
- `store(key, value)` / `load(key)` keep small JSON (IDs, cursors, summaries) across calls. The sandbox has no Node APIs, file system, network, or timers, and a script cannot start another script.

```js
// run a scoped test and print only the failures
const r = await tools.bash({ command: "pnpm --filter @tuari/web test --run src/features/x.test.tsx 2>&1" });
const lines = r.output.split("\n").filter((l) => /FAIL|✗|×|Error|Tests\s/.test(l)).slice(0, 40);
text(`exit=${r.exit_code}\n${lines.join("\n")}`);
```

The workflow points back here: `docs/engineering-workflow.md` under
*3. Implementation*, and `.agents/skills/feature-implement/SKILL.md` under
*Implement with tests*. The full reference is `docs/codemode.md` in the pi
installation.

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

**The design pass is a merge gate.** Every PR runs three skills against **the work
that PR did** — its diff, not only the new modules in it:

- **`domain-modeling`** — does the change use the project's vocabulary, and is any
  new domain rule stated once, in the right place?
- **`codebase-design`** — is anything it added shallow (apply the deletion test),
  is each seam real or hypothetical, did it introduce duplication that will drift?
- **`improve-codebase-architecture`** — what friction did this change create?

**It is incremental.** Fix what this diff made worse plus the cheap cleanups it
exposes — a deleted duplicate, a rule single-sourced, a seam moved where it
belongs. A finding whose fix would sprawl belongs in its own issue, filed with the
finding: a feature PR must not turn into a refactor. The bar is that the codebase
is never left worse than the PR found it — a PR that would leave the codebase
harder to change does not merge "and get cleaned up later": the mess compounds.
Record the outcome in `.scratch/reviews/<issue-id>/<HEAD>-design-pass.md`
(the filename must contain the reviewed HEAD SHA), including "nothing found" —
silence is not evidence the pass ran.

The same three skills also run over the **whole codebase**, periodically rather
than per PR (#451): per PR asks "did this diff make things worse", periodically
asks "what is worse everywhere". For a large change, run both.

## Crew dispatch shape (parallel lanes)

When running parallel agent lanes (the crew-dispatch skill), the default shape
is VISIBLE agents — one Herdr workspace per lane, one live agent session per
worktree — whenever the captain is present and the lanes mutate code. Headless
children are only for read-only scouts/probes, or with the captain's explicit
opt-in. An explicit captain instruction like "don't use herdr" / "run
headless" always wins. Never let "run-to-completion" silently become
"invisible".

**Launching a visible lane goes through `scripts/crew/launch-lane.mjs`** — for
that shape it is the only sanctioned launcher (workers and reviewers alike); a
visible lane started without it is not crew dispatch. The rule is scoped to the
visible shape: an explicit captain opt-in ("run headless" / "don't use herdr")
launches through the async workflow instead, and the launcher does not apply.

### Crew concurrency and landing policy

- Use **three concurrent mutation lanes/worktrees by default**. Only the
  captain may raise the cap, and the raise is per batch; otherwise wait for a
  lane to finish and its Herdr workspace to be closed before starting the next.
  Track waiting work outside git (`.scratch/queue.md`, which is gitignored) — a
  queue is not a commit.
- A lane may implement, validate, and report. The parent owns pushing and
  creating PRs; a lane must never merge anything.
- A lane may propose deferring out-of-scope work to a follow-up PR, but it must
  ask the parent first with the exact finding, scope, dependency, and proposed
  destination. The parent decides whether to fix it in the current PR, defer
  it, or reorder/queue other worktrees. No silent deferrals.
- **Never merge a PR from crew automation, even after a clean review.** A clean
  review authorizes at most opening/updating the PR and stopping. Merge is not a
  crew deliverable.
- After the parent receives a lane handoff, **close the Herdr workspace**. A lane
  whose deliverable exists — a pushed branch, an opened PR, a reported review —
  is done with that view; keeping it idle holds a lane slot and leaves the fleet
  ambiguous about what is still in flight. For more work on the same worktree,
  launch a fresh lane on it (the worktree and branch persist) rather than
  re-prompting a finished one. Preserve the workspace/pane/session identifiers
  in the handoff so the context can be reopened if it is genuinely needed.

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
