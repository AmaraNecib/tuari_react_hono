# Tuari execution policy in AGENTS.md

## Decision

Record the owner's Tuari-specific parent/worker execution policy in the tracked
agent instructions so a successor can act from the committed handoff. Keep the
payroll-first, root-paused boundary explicit until coordinator resumption after
the final domain handoff.

## Scope and source boundary

Edited only `AGENTS.md` and this design note. Adapted Dockan's parent/worker
roles, heavy verification delegation and one-writer worktree mechanics to
Tuari's existing T3, focused-local / CI-final workflow. Used the owner's
approved `delegate_task`/`isolation: "shared"` exception for one writer in an
existing isolated PR tree, with the parent relinquishing edits.

Dockan's issue rules, review tiers, lifecycle, merge/auto-merge rules, quotas,
commands and activation evidence are excluded. Tuari's existing review and
publication gates remain unchanged. No full test, build or browser run is
justified for this instructions-only change.

## Handoff requirement

The successor root reads the committed `AGENTS.md` before resuming root work.
This note records the policy's origin and boundaries; it does not replace that
source instruction.
