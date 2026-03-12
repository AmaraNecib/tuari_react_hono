# Tuari Multi-Agent Delivery Plan

## Purpose

This plan defines how work moves from isolated agent branches into stable integration branches without mixing product work, workflow work, and release preparation in the same milestone.

## Branch Naming Rules

- Agent implementation branches use `agent/phaseN-short-description`.
- Integration branches use `integration/phaseN-short-description`.
- Hotfix branches use `hotfix/short-description` only for urgent repair work after an integration branch has already been validated.
- `phaseN` must match the active milestone described in this plan.

## Delivery Expectations By Phase

| Phase | Branch focus | Exit criteria |
| --- | --- | --- |
| Phase 0 | Repository unblock and baseline web workspace recovery | Core worktree opens, installs, and tracks the intended web app files cleanly |
| Phase 1 | Workflow foundation assets for multi-agent delivery | Plan, checklist, PR templates, naming rules, and automated validation exist in-repo |
| Phase 2+ | Product or infrastructure milestones | Each phase should add a scoped plan update, branch-specific validation, and a PR ready for integration |

## Phase 1 Milestone

Phase 1 is the first process-focused milestone after the repository unblock in Phase 0.

Deliverables:

1. Add this delivery plan under `plans/`.
2. Add a reusable branch verification checklist template.
3. Add pull request templates for agent and integration branches.
4. Document branch naming and phase expectations in repo docs.
5. Add lightweight automated validation so workflow assets can be checked in CI or before review.

Non-goals:

- no feature delivery
- no UI changes
- no runtime behavior changes
- no infrastructure rollout changes beyond workflow validation

## Working Agreement For Agent Branches

Every agent branch should:

1. target exactly one phase milestone
2. keep scope narrow enough for review in one pull request
3. add or update at least one verification command when the branch changes repo behavior or process assets
4. leave a review trail that states files changed, validation run, and follow-ups

## Integration Branch Expectations

An integration branch should exist when multiple agent branches for the same phase need to be reconciled before merging to the long-lived base branch.

Integration branches should:

1. merge only phase-matched agent branches
2. rerun the shared validation suite plus branch-specific checks
3. record unresolved conflicts, intentional omissions, and rollback notes in the pull request

## Definition Of Done For Any Phase Branch

A branch is ready for review when:

- naming matches the branch rules
- scope matches the declared phase
- validation commands are documented and passing
- pull request template sections are filled in
- follow-up work is called out instead of being hidden in review comments

## Updating This Plan

When a new phase starts:

1. add the new phase goal and exit criteria here
2. keep earlier phases as an audit trail
3. update templates only when the workflow actually changes
