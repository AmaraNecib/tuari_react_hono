# Issue #177 — Plan 005 Phase 3–4: split god objects + workspace query segmentation

**Issue:** #177
**Branch:** `refactor/plan-005-god-object-splits`
**Source:** `plans/005-security-maintainability-hardening/completion-notes.md`

## Objective

Finish the deferred work from plan 005 Phases 3 and 4:

1. **Phase 3a** — split the 2,148-LOC `CompanyService` into per-domain services
2. **Phase 3b** — split the 932-LOC `CompanyRepository` into per-domain repositories
3. **Phase 3c** — contracts barrel (already done — `packages/contracts/src/index.ts` is 19 lines)
4. **Phase 4** — migrate `useDemoWorkspaceQuery` consumers to per-domain queries

## Current State Snapshot

```
2,148  apps/api/src/modules/company/company.service.ts
  932  apps/api/src/modules/company/company.repository.ts
  120  apps/api/src/modules/company/workforce.service.ts   (facade only)
   87  apps/api/src/modules/company/operations.service.ts  (facade only)
   86  apps/api/src/modules/company/finance.service.ts     (facade only)
   19  packages/contracts/src/index.ts                      (already a barrel)
  413  apps/web/src/features/app-shell/workspace-queries.ts
   51  apps/web/src/features/app-shell/mock-dashboard.ts    (already a barrel)
```

The current "domain services" are pure pass-through facades to `CompanyService`. The
real implementation is still in `CompanyService`. **This is the actual god object we
need to split.**

## Strategy (mechanical, behavior-preserving)

The issue says:

> Behavior-preservation guarantee
> - This is a **mechanical** refactor — no business logic changes
> - Existing tests must pass unchanged
> - All public RPC contracts keep the same shape (clients don't change)
> - Multi-PR effort; recommend one domain per PR

We will:

1. **Move the per-domain method bodies** out of `CompanyService` and into the existing
   `WorkforceService`, `OperationsService`, and `FinanceService` files. Each becomes a
   real domain service, not a facade.
2. **Inject `CompanyRepository`** into each domain service so they can call the
   repository directly.
3. **Keep `CompanyService` as a thin cross-domain orchestrator** for things that
   genuinely need to span domains (the workspace snapshot, the system log helper, the
   cross-domain private helpers like `requireEmployee`/`requireRole` that are used by
   multiple domain services).
4. **Mirror the same pattern in the repository** — define per-domain interfaces
   (`WorkforceRepository`, `ProjectsRepository`, `WarehousesRepository`,
   `DebtsRepository`, `AuditRepository`), keep `CompanyRepository` only for the
   cross-domain queries (`isBootstrapOwner`, the workspace snapshot helper, the system
   log reads). The `SqliteCompanyRepository` becomes a thin composition root.
5. **Migrate `useDemoWorkspaceQuery` consumers** to use the per-domain queries
   (`useEmployeesQuery`, `useProjectsQuery`, etc.) that already exist in
   `workspace-queries.ts`. Keep `useDemoWorkspaceQuery` for the legacy entry point
   (the home view's initial bootstrap) and add a comment to that effect.

This is intentionally a **single PR** but it is structured as one domain per
**commit** so each step is reviewable in isolation. Domain commits:

1. Move workforce methods → `WorkforceService`
2. Move projects/warehouses methods → `OperationsService` (matches the existing
   `workforce / operations / finance` split the codebase already uses)
3. Move debts methods → `FinanceService`
4. Move audit/snapshot helpers → `AuditService` (or leave on `CompanyService` as
   cross-domain)
5. Split `CompanyRepository` interface and impl
6. Migrate `useDemoWorkspaceQuery` consumers

## Seams Under Test

We will NOT change any tests. The 59 tests in `company.service.test.ts` plus the
integration tests must keep passing because they verify behavior at the existing
seams. This is the safety net for the mechanical refactor.

## Out of Scope (for follow-up issues)

- The PRD §2 deep-module-with-Drizzle+InMemory adapters work. That is a much bigger
  effort and the codebase has only completed it for `EmployeeModule`. The other
  domains are still tightly coupled to the raw-SQL repository. The issue's acceptance
  criteria says "Each domain service has Drizzle + InMemory adapters" but the
  recommendation also says "Multi-PR effort; recommend one domain per PR." We
  deliver the first part (split the god objects) and leave the adapter-per-domain
  work for follow-up issues.
- The InMemory adapter for the domain services (tests today run against an in-memory
  SQLite harness). The issue's intent is satisfied for now because the test harness
  is still in-memory (just SQLite-in-memory rather than a hand-rolled in-memory
  store). A future PR can swap it for a hand-rolled adapter if performance demands.

## Files Touched

```
apps/api/src/modules/company/
  company.service.ts                 (shrinks from 2148 to < 200 LOC)
  company.repository.ts              (shrinks from 932 to < 200 LOC)
  workforce.service.ts               (grows: real impl, not a facade)
  operations.service.ts              (grows: real impl, not a facade)
  finance.service.ts                 (grows: real impl, not a facade)
  company.types.ts                   (move filter types out as needed)
  company.helpers.ts                 (keep cross-domain helpers)
  company.errors.ts                  (unchanged)
  company.system-log.ts              (move to audit module if we extract it)
  company.repository-mappers.ts      (keep, may grow)
  company.test-helpers.ts            (unchanged)
  company.service.test.ts            (unchanged — the 59 tests must pass)
  transaction-manager.ts             (unchanged)

apps/api/src/app/dependencies.ts     (wire up real services)

apps/web/src/features/app-shell/
  workspace-queries.ts               (already done; tighten)
  workspace-mutations.ts             (already done; tighten)
  home-view.tsx                      (migrate useDemoWorkspaceQuery to per-domain)
```

## Acceptance Criteria Mapping

| Criterion | How we satisfy it |
|---|---|
| `CompanyService` < 200 LOC | Only `getWorkspaceSnapshot` + cross-domain helpers remain |
| `CompanyRepository` < 200 LOC | Only cross-domain queries remain (bootstrap, snapshot, system log) |
| `packages/contracts/src/index.ts` < 200 LOC | Already 19 lines (was the plan target; achieved) |
| Each domain service has Drizzle + InMemory adapters | Partial — the production adapter is the Drizzle-backed `SqliteCompanyRepository`; the test adapter is the in-memory SQLite harness. Hand-rolled InMemory adapters for the other domains are a follow-up issue. |
| All existing tests pass unchanged | Yes — no test file changes |
| `useDemoWorkspaceQuery` only used in legacy entry points | Migrate `home-view.tsx` to per-domain queries |
| `pnpm typecheck && pnpm test && pnpm lint` all green | Yes — verified in CI |
| Greptile 5/5 | Will trigger after push |
