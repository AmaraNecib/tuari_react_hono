# Agent guidelines

## Start here

Read [the engineering workflow](docs/engineering-workflow.md), then load
`feature-implement` for code-changing work. Read the
[wisdom index](.agents/wisdom/README.md), search matching lessons and check
their assumptions against current source.

Current verification mode and protection are defined in the workflow and
[activation record](docs/ci-final-activation.md). Never assume another
repository's CI-final activation applies here.

## Worktree and authority

Use one writer per isolated worktree. Preserve unrelated changes. Workers
commit and report; the parent owns publication, PR watches and merge.
A child does not push, open a PR or merge. A local-only instruction means
no publication even if GitHub is reachable.

### Parent and worker execution

Each independent issue thread is that issue's parent architect and manager. It
scopes and delegates implementation and verification, checks the evidence, and
integrates and commits as needed. It owns PR publication and any merge explicitly
authorized by the owner. It is not the coordinator's implementation child or the
default solo implementation worker. Workers implement, prove, commit and report.
Read-only reviewers return findings and do not edit source.

Delegate full suites, E2E, builds and browser execution to a verification worker,
which must run heavy commands through `heavy_run`. The parent may run one only
when the owner explicitly asks or a documented necessary inability to delegate
blocks the check. Before that exception, record the exact check, why delegation
is unavailable and why the check is needed. Queue admission never expands the
verification scope. Parent reads, diffs, selector checks, lint, typecheck and
small integration corrections remain allowed; the parent is not the default
implementation or test runner. Follow Tuari's focused-local / CI-final scope and
activation record, not another repository's gates.

One writer owns each isolated PR worktree. The owner permits assigning one
implementation worker with `delegate_task` and `isolation: "shared"` to the
parent's existing isolated PR worktree; the parent gives up all edits while that
worker owns it. Never share the project root or allow concurrent parent/worker
writes. Use another worktree only for genuinely independent concurrent scope.
A read-only reviewer uses the actual source tree at a frozen SHA. A verifier
creates no checkout. Cancel a writer and confirm it stopped before replacing it,
preserving its source and proof. Do not restart valid running work or review
solely to change the worktree arrangement.

Run independent, disjoint tasks in parallel. Keep tightly dependent work serial,
with one meaningful handoff instead of repeated peer messages. Preserve the
current payroll-first, root-paused order until the coordinator explicitly
resumes root work after the final domain handoff. Keep T3 children visible and
select Luna explicitly. A successor root worker must read this committed policy
before resuming; chat alone is not the handoff.

Inside T3, use visible `delegate_task` children. Resolve exact model IDs with
`orchestrator_capabilities`; choose `openai-codex/gpt-6-luna` explicitly for
ordinary work. Use async mode for work that takes minutes and let completion
wake the parent. A reviewer reads the actual source-owning worktree at a
committed SHA and writes no source. Optional OpenCode routes are not automatic
quota fallbacks. Follow the workflow's recorded independence exception.

Default to six ordinary children on disjoint files, fewer when resources or
ownership require it. Full tests, builds and browser agents use `heavy_run`
after their scope is justified. A free heavy slot does not authorize a full
suite. Serialize generated-output writers inside each worktree.

## Commit and evidence discipline

Stage named source, config, tests, skills and the current design note.
Never run `git add .` or `git add -A`.

- Commit `.scratch/implementation/<scope>-design.md`.
- Keep `.scratch/reviews/`, session logs, issue drafts and generated outputs
  ignored and local. Review reports are never committed or posted.
- Commit complete reviewable scope before review. Keep it frozen while
  reviewers read; commit fixes before refreshing affected proof.
- Do not add evidence-only commits. Record post-commit checks against that SHA.
- Preserve earlier failure logs and honest review boundaries.

## Verification and review

Run affected tests and direct integration cases locally, with relevant lint
and typecheck. Record scope, exact SHA, commands, exit codes, counts, durations
and log paths. Background verification inherits the parent's explicit mode;
it does not widen scope. Full checks are CI-final unless a concrete gap
justifies a local run. See `guard` for completion criteria.

All three initial lenses remain required here: `debate`, `test-audit`,
`code-review`. A bounded fix gets one fresh combined-delta review, carrying
forward unchanged conclusions explicitly. Never rerun a valid exact-tree
execution merely to get another report. Current-head verdicts and unresolved
findings still gate merge.

Use `domain-modeling` and `codebase-design` on changed modules.
Architecture review is parent-owned and scoped to changed interfaces/seams,
not an unconditional whole-tree sweep.

## Wisdom and delegation

Lessons use `.agents/wisdom/<category>/<lesson>.md`, without dates in filenames.
Only the parent writes repeated lessons. Workers read matching lessons and
record applied/excluded ones plus candidates in their commit body.
Read `writing-for-agents` before editing agent instructions or briefs.

When the owner requests a session retrospective, load
[retro](.agents/skills/retro/SKILL.md). Return evidence-backed recommendations
before making follow-up changes. Retro is optional, not a completion gate.

Each delegation names the absolute tree, exact revision, goal, required
reading, verification mode, writable files, exclusions, proof and completion.
Write ordinary sentences, not compressed words. The parent owns ambiguous
scope decisions; workers never silently defer findings.

## Tool and command safety

Scope searches to the repository or intended subdirectory. Use `read` for
files and `edit` for targeted changes. Prefer `codemode` for independent
calls or large outputs; print bounded results and retain raw logs on disk.

On Windows use saved PowerShell files, literal absolute paths and native exit
codes. Never embed PowerShell variables inside Bash double-quoted commands.
Avoid cleanup; use fresh log directories and refuse overwrites.

## Publication and issues

Only publish when authorized. When opening a PR, link and watch it in the
same turn. Preserve watches while open; confirm MERGED with a merge commit
or CLOSED before removing a terminal watch.

Request Greptile once per published head; missing verdicts block merge.
Use `Part of #N` for partial scope and `Closes #N` in the body only when all
acceptance criteria ship. Never close an issue based on its PR title.
No lane merges, and owner-only policy, CI, schema, contract or crypto decisions
remain owner-only.
