# Tuari Multi-Agent Delivery Plan

## Goal

Break the earlier review into delivery phases that can be executed by multiple agents without losing review quality, test coverage, or integration discipline.

## Current Blocker

- `apps/web` is currently recorded in the parent repository index as a gitlink/submodule-style entry (`160000` mode), not as normal tracked files.
- That can block normal `apps/web` file commits from the parent repo until the index layout is corrected.
- Treat this as the first repository-level unblock before assigning normal web implementation work.

## Phase Plan

### Phase 0 - Repository Unblock

- Fix the `apps/web` gitlink/index issue so parent-repo commits can include normal web file changes.
- Confirm the intended repository shape for `apps/web` before any agent opens a web implementation branch.
- Re-run a basic repo sanity check after the fix: status, install, typecheck, and known build commands.

### Phase 1 - Delivery Foundations

- Lock the phase boundaries, ownership map, and branch naming conventions.
- Add or standardize test entry points for each surface: API, web, desktop, and shared contracts.
- Define verification checklists and PR templates so every agent branch ships with the same quality bar.
- Capture any required repo/CI updates needed to support unit, integration, and E2E work.

### Phase 2 - Shared Contracts and API Core

- Stabilize shared contracts first where downstream web and desktop work depends on them.
- Implement API-side architectural fixes, service/repository coverage, and integration tests.
- Keep transport wiring thin and move business logic into modules/services where needed.

### Phase 3 - Web App Improvements

- Apply the reviewed web structure and runtime/UI improvements after the repo unblock and contract updates land.
- Add unit/integration coverage for feature logic and E2E coverage for critical user paths where appropriate.
- Keep web branches scoped to user-facing behavior, routing, diagnostics, and API consumption.

### Phase 4 - Desktop Runtime and Packaging

- Implement Tauri/runtime/path/logging/sidecar improvements that depend on completed API and web behavior.
- Add desktop verification and smoke coverage around startup, health checks, packaging, and portable behavior.
- Treat packaging changes as late-phase work because they validate the integrated system, not isolated features.

### Phase 5 - Integration and Release Readiness

- Merge completed phase branches into a dedicated integration branch.
- Run integrated typecheck, build, test, and end-to-end verification across API, web, desktop, and contracts.
- Fix cross-branch regressions on the integration branch or in targeted follow-up branches, then prepare the final release PR.

## Branch-Per-Agent Workflow

- Create one implementation branch per agent and per scoped task, for example: `agent/api-phase2-auth`, `agent/web-phase3-runtime-panel`, `agent/desktop-phase4-portable-smoke`.
- Keep each branch focused on one deliverable with a clear owner, linked phase, and explicit dependency list.
- Do not mix unrelated API, web, and desktop work in the same implementation branch unless the task is intentionally cross-cutting and reviewed that way.
- Rebase or merge from the current target branch only as needed to resolve approved dependencies; avoid long-lived drifting branches.

## Requirements For Every Implementation Branch

Each implementation branch must include:

- its own code review before merge
- its own tests: unit, integration, and E2E as appropriate to the scope
- its own verification checklist in the branch PR or companion notes

Minimum checklist for every branch:

- scope statement and dependency statement
- files/surfaces changed
- tests added or updated
- local verification commands run
- known risks, follow-ups, or deferred items

## When Parallel Branches Are Allowed

Parallel work is allowed when:

- branches touch different surfaces with no shared contract or schema dependency
- branches only consume already-merged interfaces
- one branch can be reviewed and tested without unpublished changes from another branch
- the integration branch can absorb both branches without ambiguous ownership of the same files

## When Work Must Stay Sequential

Work must stay sequential when:

- a branch changes shared contracts, Prisma schema, auth/session behavior, or build pipeline inputs used by other branches
- downstream work depends on new APIs, route shapes, runtime commands, or packaging outputs not yet merged
- multiple branches would need to edit the same feature area or same verification assets at the same time
- the repository/blocker state would make branch validation unreliable, especially for `apps/web`

Recommended sequencing rule:

- contracts and repo-shape fixes first
- API/core behavior next
- web and desktop consumers after their dependencies are merged
- packaging/release work last

## Integration Branch

- Create a dedicated branch such as `integration/phase-complete` once a set of reviewed implementation branches is ready.
- Merge only completed branches that already passed their own review, tests, and checklists.
- Use the integration branch for combined regression testing, cross-surface verification, and dependency conflict cleanup.
- Do not treat the integration branch as a place for unfinished feature development.

Integration branch exit criteria:

- merged branches are conflict-resolved
- integrated typecheck/build succeeds
- integrated unit/integration/E2E coverage passes for the affected surfaces
- manual verification of critical desktop runtime flows is complete
- blockers and follow-ups are documented before release PR creation

## Final PR and Merge Flow

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

## Operating Notes

- Prefer short-lived branches and phase-based merge windows over long-running parallel drift.
- If a branch discovers a new shared dependency, stop parallel downstream work and move that dependency into the active sequential path.
- If integrated testing fails, fix on a focused follow-up branch or directly on the integration branch only when the issue is purely merge-related.
