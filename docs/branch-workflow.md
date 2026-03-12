# Branch Workflow

## Naming Convention

- `agent/phaseN-short-description`: isolated implementation branch for one phase milestone
- `integration/phaseN-short-description`: merge-and-verify branch for combining multiple agent branches in the same phase
- `hotfix/short-description`: urgent repair branch outside the normal phase sequence

`phaseN` should increment only when the milestone changes.

## Phase Expectations

- Phase 0 restores or unblocks the repository baseline.
- Phase 1 establishes reusable workflow assets and validation for multi-agent delivery.
- Later phases should each define their own goal, acceptance checks, and review surface in `plans/tuari-multi-agent-delivery-plan.md`.

## Pull Request Expectations

- Agent branches should explain the milestone target, changed files, validation run, and follow-ups.
- Integration branches should list merged inputs, conflict resolution notes, and the final verification pass.
- If a branch cannot complete validation, the pull request should state the gap explicitly instead of implying success.
