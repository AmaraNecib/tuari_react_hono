# Phase 6 - Architecture Hardening Roadmap

## Goal

Reduce coupling across the API and web app so audit behavior, account security, and future feature work stay predictable as the product grows.

## Phase 1 - Account And Audit Boundary Hardening

### Objectives

- Move account profile mutation logic out of the HTTP entrypoint.
- Make account profile updates and their audit writes atomic.
- Prepare the codebase for stronger audit guarantees and later re-auth rules.

### Tasks

- Add a dedicated account module/service for current-user profile updates.
- Move validation and session checks from `apps/api/src/app/create-app.ts` into that service.
- Execute profile update and audit insert in one database transaction.
- Keep the HTTP route thin and delegation-only.
- Add tests around the service and route wiring.

### Exit Criteria

- `create-app.ts` no longer owns profile business rules.
- Profile update writes are transactional.
- The account mutation path is easier to extend with re-auth and richer audit metadata.

## Phase 2 - Audit Correctness And Ledger Integrity

### Objectives

- Preserve historical actor labels instead of resolving them from mutable current records.
- Keep transaction ordering, grouping, and filtering deterministic.

### Tasks

- Add immutable actor-label snapshots for audit-producing mutations.
- Centralize system-log event assembly into focused mappers/builders.
- Replace string timestamp ordering with shared timestamp comparison helpers everywhere.
- Add cross-case tests for mixed offsets, grouped events, and filter combinations.

## Phase 3 - API Domain Decomposition

### Objectives

- Break down oversized company domain files into smaller services and repositories.
- Keep feature additions local instead of editing one central god file.

### Tasks

- Split `company.service.ts` into role, employee, project, warehouse, compensation, and audit sub-services.
- Split `company.repository.ts` by aggregate or query family.
- Move shared validation/time helpers into dedicated utility modules.
- Introduce composition at the module boundary rather than inside one monolith.

## Phase 4 - Web Feature Decomposition

### Objectives

- Reduce UI orchestration sprawl in the app shell.
- Make adding/removing screens less risky.

### Tasks

- Split `home-view.tsx` into route-level containers and feature presenters.
- Replace `mock-dashboard.ts` with focused query/mutation hooks per feature.
- Add a single aggregate workspace query only where the shell truly needs one.
- Keep feature-local selectors/formatters near each feature instead of in the shell.

## Phase 5 - Security And Operational Hardening

### Objectives

- Close the remaining account and transport risks.
- Make sensitive flows safer under session theft and long-lived clients.

### Tasks

- Require current-password re-auth before changing the login phone number.
- Review bearer-token handling for desktop and session invalidation behavior.
- Reduce raw SQL exposure where safer primitives are available.
- Add security-focused integration tests for account mutation flows.

## Phase 6 - Quality Gates And Long-Term Maintainability

### Objectives

- Make architecture drift visible early.
- Keep future feature work cheaper.

### Tasks

- Add targeted integration tests for account rename, audit ordering, and system-log filters.
- Add code-size / layering review checks for oversized files.
- Document module ownership and extension points in `plan/` and code comments only where necessary.
- Define refactor-complete criteria before starting the next major feature batch.
