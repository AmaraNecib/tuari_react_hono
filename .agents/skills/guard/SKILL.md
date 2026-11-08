---
name: guard
description: "Canonical pre-commit, committed-head verification and pre-report checks. Uses affected local proof, exact-SHA evidence and separately enforced CI acceptance."
---

# Guard

Read `docs/engineering-workflow.md` and the parent's explicit verification mode.
Do not infer activation. This repository's protection rollout is documented in
`docs/ci-final-activation.md`.

## Phase 1: before commit

1. Confirm absolute cwd, base and intended paths. Preserve unrelated changes.
2. Run focused regression and affected integration cases, plus relevant lint,
   typecheck and generated-file checks. Record commands and outcomes.
3. Inspect `git diff --check` and stage named source/config/test/design paths
   only. Generated builds, databases, native binaries and review logs stay local.
4. Commit complete reviewable scope before final verification and review.

Use the available workspace commands, not another repository's Bun commands.
For example, `pnpm --filter @tuari/api exec vitest run <file>` or
`pnpm --filter @tuari/web exec vitest run <file>` selects explicit cases.
Contracts compilation may be needed to execute an affected test; name that
dependency before building it. Relevant Rust changes require affected Rust
proof and clippy; full crates need an explicit coverage reason.

## Phase 2: committed-head local readiness

Verify the committed SHA, not an uncommitted draft.

- Focused behavioral proof covers changed code and direct callers. Add
  applicable lint/typecheck and selected browser proof.
- Initial debate, test-audit and code-review evidence names exact base/head,
  actual reviewer IDs/models and any same-family exception.
- A bounded correction has affected proof and one fresh combined-delta review,
  with unchanged conclusions carried forward explicitly.
- The local reviewloop records current-head 5/5 and no unresolved actionable
  finding. A passing suite is not a review.
- The working tree has no unintended source changes. Ignored logs do not
  require cleanup or another commit.

Full suites, full browsers, production builds and audits run in CI, not as
routine local prerequisites. A named uncertainty or CI coverage gap justifies
a specific expansion; a free heavy slot does not. Never run local red-on-parent
replay as a gate.

### Background verification

The parent specifies absolute worktree, exact committed HEAD, mode, selected
files, commands, timeouts and unique log paths. The validator may write ignored
evidence only. It checks source identity before and after, uses native exit
codes and preserves failed logs. Record elapsed time, selected scope, counts,
skips and raw output paths. Mark failures and expected-red probes separately.
Let async completion wake the parent; do not poll.

Use `heavy_run` for justified heavy commands. Serialize generators within the
same worktree. On Windows use saved PowerShell scripts with literal absolute
paths and real native exit codes. Inspect diagnostics even after exit zero,
refuse overwrites, preserve UTF-8 and avoid cleanup.

### Evidence freshness

Reports live in ignored `.scratch/reviews/<scope>/<HEAD>-*.md` or JSON.
Verify exact-tree source and execution provenance. A new reviewable change
requires a current-head bounded review, not renaming an old report to imply
it read new code. Non-reviewable-only deltas may carry earlier conclusions
when their exact boundary is recorded. Never commit, post or attach reports.

## Phase 3: pre-report and parent merge gate

Report local readiness, hosted acceptance and enforcement as separate states.
For local-only work, do not publish or claim CI/merge/issue closure.
For authorized remote work, verify current-head hosted verdicts, all finding
dispositions, `CI acceptance`, mergeability and effective protection.

Only the owner changes protection or accepts bypass. An enforcement regression
or missing verdict blocks merge; do not silently widen local execution or
change review providers. Preserve open PR watches.

## Failure handling

State the failing command, native exit code, named assertion or diagnostic,
cause when established, and next focused action. Do not call an unrelated
failure a pass. Keep retries separate and never use a score or waiver to
conceal an unresolved mandatory gate.
