# Plan 006 Completion Notes

Status snapshot after the 2026-04-29 work session.

## Phase 1 — Service-layer authorization guards — DONE

- `CompanyService` and `InventoryService` accept an `AuthBootstrapService` and call a private `assertWorkspaceAdmin` at the top of every mutating method.
- Wired through `apps/api/src/app/dependencies.ts`.
- Router-level `requireWorkspaceAdmin` checks remain as a second layer.
- `apps/api/src/modules/company/company.service.test.ts` exercises null-actor, non-admin, and admin happy paths.

## Phase 2 — Atomic inventory receive — DONE

- `inventoryReceive` exposed as a single endpoint backed by the existing transactional invoice flow that already wraps invoice group, inventory entries, balances, movements, and debt integration in one transaction.
- RPC handler added in `apps/api/src/rpc/router.ts`.

## Phase 3 — Financial calculation unit tests — DONE

- Added regression tests for salary amount validation and debt balance/date boundaries in `company.service.test.ts`.

## Phase 4 — Audit log UI — DONE

- `apps/web/src/features/app-shell/system-log-section.tsx` renders the audit log with actor search, entity-id column, loading, error, and empty states.
- Wired into the workspace section navigation through `home-view-page-content-detail-pages.tsx`.
- Pagination uses the shared table-pagination control.

## Phase 5 — E2E suite — PARTIAL

- `playwright.config.ts` configured with HTML reporter and CI retries.
- `tests/e2e/foundation-smoke.spec.ts` covers bootstrap and sign-in.
- The 4 remaining critical-path specs (employees, projects, inventory transfer, debt entry) are not yet authored. Adding them requires an isolated DB reset endpoint or per-spec snapshot strategy; current foundation-smoke runs against a fresh `APP_DB_PATH` per Playwright invocation, but per-test isolation is not yet in place. Deferred.

## Phase 6 — ORM unification — DONE

- `docs/architecture-decisions.md` documents ADR-001: Prisma for auth, raw SQL for business domains.
- Repository contributor guidance is in place.

## Validation

- `pnpm typecheck` — green
- `pnpm lint` — green
- `pnpm test` — green (109 API, 108 web)
- `pnpm build` — green
