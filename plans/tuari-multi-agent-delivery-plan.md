# Tuari Multi-Agent Delivery Plan

## Purpose

This plan defines how work moves from isolated agent branches into stable integration branches without mixing product work, workflow work, and release preparation in the same milestone.

## Goal

Break the earlier review into practical delivery phases that multiple agents can execute without losing review quality, test coverage, or integration discipline.

## Branch Naming Rules

- Agent implementation branches use `agent/phaseN-short-description`.
- Integration branches use `integration/phaseN-short-description`.
- Hotfix branches use `hotfix/short-description` only for urgent repair work after an integration branch has already been validated.
- `phaseN` must match the active milestone described in this plan.

## Phase Roadmap

### Phase 0 - Repository Unblock

- Fix the `apps/web` gitlink/index issue so parent-repo commits can include normal web file changes.
- Confirm the intended repository shape for `apps/web` before any agent opens a web implementation branch.
- Re-run a basic repo sanity check after the fix: status, install, typecheck, and known build commands.

### Phase 1 - Delivery Foundations

- Add this delivery plan under `plans/` and keep branch naming rules stable.
- Add the checklist, PR templates, and docs needed by every agent and integration branch.
- Add lightweight automated validation so workflow assets can be checked in CI and before review.
- Keep Phase 1 focused on workflow assets, not feature delivery.

### Phase 2 - Shared Contracts and API Core

- Stabilize shared contracts before downstream web or desktop work depends on them.
- Implement API-side architectural fixes, service or repository coverage, and integration tests.
- Keep transport wiring thin and move business logic into modules or services where needed.

### Phase 3 - Web App Improvements

- Apply reviewed web structure and runtime or UI improvements after Phase 0 and Phase 2 dependencies land.
- Add unit or integration coverage for feature logic and E2E coverage for critical user paths where appropriate.
- Keep web branches scoped to user-facing behavior, routing, diagnostics, and API consumption.

### Phase 4 - Desktop Runtime and Packaging

- Implement Tauri, runtime, path, logging, and sidecar improvements after API and web behavior is stable.
- Add desktop verification around startup, health checks, packaging, and portable behavior.
- Treat packaging changes as late-phase work because they validate the integrated system.

### Phase 5 - Integration and Release Readiness

- Merge completed phase branches into a dedicated integration branch.
- Run integrated typecheck, build, test, and end-to-end verification across API, web, desktop, and contracts.
- Fix cross-branch regressions on the integration branch or in targeted follow-up branches before the final release PR.

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

Each implementation branch must also include:

- its own code review before merge
- its own tests: unit, integration, and E2E as appropriate to the scope
- its own verification checklist in the branch PR or companion notes

Minimum checklist for every branch:

- scope statement and dependency statement
- files or surfaces changed
- tests added or updated
- local verification commands run
- known risks, follow-ups, or deferred items

## Parallel And Sequential Work

Parallel work is allowed when:

- branches touch different surfaces with no shared contract or schema dependency
- branches only consume already-merged interfaces
- one branch can be reviewed and tested without unpublished changes from another branch
- the integration branch can absorb both branches without ambiguous ownership of the same files

Work must stay sequential when:

- a branch changes shared contracts, Prisma schema, auth or session behavior, or build pipeline inputs used by other branches
- downstream work depends on new APIs, route shapes, runtime commands, or packaging outputs not yet merged
- multiple branches would need to edit the same feature area or the same verification assets at the same time
- the repository blocker state would make branch validation unreliable, especially for `apps/web`

Recommended sequencing rule:

- contracts and repo-shape fixes first
- API and core behavior next
- web and desktop consumers after their dependencies are merged
- packaging and release work last

## Integration Branch Expectations

An integration branch should exist when multiple agent branches for the same phase need to be reconciled before merging to the long-lived base branch.

Integration branches should:

1. merge only phase-matched agent branches
2. rerun the shared validation suite plus branch-specific checks
3. record unresolved conflicts, intentional omissions, and rollback notes in the pull request

Integration branch exit criteria:

- merged branches are conflict-resolved
- integrated typecheck and build succeed
- integrated unit, integration, and E2E coverage passes for the affected surfaces
- manual verification of critical desktop runtime flows is complete when relevant
- blockers and follow-ups are documented before release PR creation

## Definition Of Done For Any Phase Branch

A branch is ready for review when:

- naming matches the branch rules
- scope matches the declared phase
- validation commands are documented and passing
- pull request template sections are filled in
- follow-up work is called out instead of being hidden in review comments

## Final PR And Merge Flow

1. Agent branch completes implementation, tests, verification checklist, and branch-level code review.
2. Approved branches merge into the integration branch for the active phase or release train.
3. Integrated testing passes across the combined changes.
4. Create one final PR from the integration branch to the main branch with a concise release summary, risk notes, and verification results.
5. Merge the final PR only after integrated review passes and any release-blocking defects are closed.

## First Recommended Execution Order For Phase 1

1. Resolve the `apps/web` gitlink/index blocker so web work can be committed normally from the parent repo.
2. Freeze branch naming, ownership, PR template, and verification checklist conventions.
3. Add or standardize root and package-level test commands so every agent branch has runnable verification targets.
4. Define the first shared-contract and API-core tasks that other branches depend on.
5. Start only the implementation branches that do not overlap on contracts, schema, or repo-shape fixes.

## Updating This Plan

When a new phase starts:

1. add the new phase goal and exit criteria here
2. keep earlier phases as an audit trail
3. update templates only when the workflow actually changes
