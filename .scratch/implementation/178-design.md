# Issue #178 — Complete the 4 critical-path E2E specs

## Tier

**Standard** — E2E test files + `playwright.config.ts` + CI workflow config. No
authz/business-logic changes (the specs exercise existing RPCs through the UI).

## Base

- Target branch: `develop`
- Base SHA: merge-base of `origin/develop` and `HEAD` (resolved at implementation start)
- Rebase/prep base: `origin/develop` at `6be34976954dee8b6ef33a34ce923d348270cdb0`

## Context

`plans/006-reliability-and-correctness` Phase 5 was marked PARTIAL: only
foundation-smoke existed. Since then the suite grew to 24 spec files (42 tests,
~1.8m locally, CI e2e job ~3m total) — all green on `develop`. The 4
critical-path files exist but only cover a subset of the issue's flows:

| Spec | Current coverage | Issue requires |
|---|---|---|
| `employees.spec.ts` | create + update notes | create w/ role, **edit role**, **soft-delete**, **re-assign**, list reflects |
| `projects.spec.ts` | create (no dates/manager) | create w/ dates, assign workers, close → unassign |
| `inventory.spec.ts` | item-definition create + conditional no-op | full receive + transfer A→B + balances + audit |
| `debts.spec.ts` | counterparty + partial payment | + **consolidation close** |

## Deviations from the issue (verified against the live app)

The issue's acceptance criteria were written when the suite had 1 spec; several
scenarios are **not reachable through the current UI**:

1. **Project start/end dates** — the create/edit form (`project-form.tsx`) exposes
   only name/location/manager/status/notes. Dates exist in the schema (nullable,
   set by the assignment lifecycle) but have no UI. Spec covers create with
   manager+location, details, and close (status → COMPLETED) instead.
2. **Assign workers to project / close → workers unassigned / re-assign
   employee to a different project** — the *dormant* legacy workforce lifecycle.
   Post-Slice-3 RBAC seeds only admin/manager/viewer; the create form offers
   only those, and the assignment rules (`operations.service.ts`) branch on
   legacy keys `worker` / `project_manager` / `warehouse_manager` that cannot
   exist post-migration (documented in `company.types.ts` "dormant"). The
   project form's manager select (`buildManagerOptions`) filters on the legacy
   `project_manager` key, so it is permanently empty. `projectAssignmentsCreate`
   has no web caller. → Specs cover the reachable employee/project critical
   path (create → edit role → soft-delete; create → close) and the
   **role re-assignment** (manager → viewer) through the edit page instead.
3. **Close debt via consolidation** — the consolidation card requires a
   RECEIVABLE account for the same party, but the UI's account-create mutation
   hardcodes `direction ?? "PAYABLE"` (`workspace-mutations.ts`, comment:
   "Sale-ledger (RECEIVABLE) accounts will be wired by Issue #26"); the
   debt-create page's direction toggle only flips the opening's sign, never the
   direction. The consolidation RPC is unit-tested; the E2E covers counterparty
   → opening → partial payment → balance instead.
4. **"Total E2E coverage: 5 specs"** — stale criterion; the suite already has 22
   files. Intent (4 critical paths + bootstrap covered) is preserved.

These deviations are recorded here and will be summarized in the PR body.

## Files

- `tests/e2e/helpers/db-isolation.ts` **(new)** — per-spec DB reset.
  - Truncates all transactional tables (auth + business) while preserving the
    seeded reference tables (`role`, `role_permission`, `app_schema_state`).
  - Opens the live API sqlite file directly (established pattern: `db-seed.ts`
    already writes to the live DB), `PRAGMA foreign_keys=OFF` on the reset
    connection, deletes in any order, re-enables.
  - After a reset the user table is empty → the next `bootstrapOrSignIn`
    re-bootstraps (create-first-user path), which is self-healing for
    downstream specs (they all use `bootstrapOrSignIn`).
  - **Why truncate, not fresh APP_DB_PATH per spec**: the webServer env is fixed
    at config load; the API/web servers run once per Playwright invocation, so a
    per-spec DB file would need per-spec server restarts (not supported by the
    config's single webServer pair). Snapshot/restore of the file is not
    portable (Windows EBUSY file locking on the live connection).
- `tests/e2e/employees.spec.ts` **(rewrite)** — per-spec reset + serial:
  1. create employee with phone + role (manager)
  2. edit role (manager → viewer) via edit page → details reflect new role
  3. soft-delete via table confirm dialog → row disappears from list
- `tests/e2e/projects.spec.ts` **(rewrite)** — per-spec reset + serial:
  1. create project with name + location → details overview shows status/location
  2. close project (status → COMPLETED) via edit → details reflect closed state
- `tests/e2e/inventory-transfer.spec.ts` **(new; replaces `inventory.spec.ts`)**
  — per-spec reset + serial:
  1. create item definition (consumable w/ unit)
  2. create warehouses A + B
  3. invoice with line item received into warehouse A → invoice in list
  4. warehouse A balance shows the received quantity
  5. outbound transfer A → B (transfer dialog) → A decreased, B increased
  6. movement visible in the transfer history (سجل التحويلات)
- `tests/e2e/debt-entry.spec.ts` **(new; replaces `debts.spec.ts`)** — per-spec
  reset + serial:
  1. create external counterparty → open payable debt (we owe, +5000)
  2. record partial payment (2000) → balance +3000, hub reflects
- `tests/e2e/inventory.spec.ts` / `tests/e2e/debts.spec.ts` **(deleted)** —
  superseded by the two new specs (their flows are covered there).
- `playwright.config.ts` — unchanged (new files auto-discovered by testDir).
- `.github/workflows/ci.yml` — upload `playwright-report/` as a CI artifact on
  the e2e job (issue acceptance: "HTML report uploaded as CI artifact").

## Isolation rules (from wisdom)

- Seed values unique **per attempt** (`uniqueSuffix()`) — CI retries share the
  API DB.
- Toast/mutation assertions gate on the RPC response where a stale toast could
  pass (e.g. after saves), per `saveAccountAndExpectSuccess` precedent.
- Zero-count assertions use `queryAllByRole`, not `getAllByRole`.
- No `page.goto`-based invalidation claims; where the list must "reflect
  immediately" after a save, use SPA navigation/refetch semantics worded as
  shared-key checks.

## Tests

- Playwright E2E only (no unit tests — this issue is test-only).
- Validation: full local suite `pnpm test:e2e` (workers:1, fresh DB per run),
  plus `pnpm typecheck` (specs are type-checked by the repo's tsconfig) and
  `pnpm lint`.

## Risks

- **Port squatters** (wisdom: sibling worktrees hold 3000/4318). Verify port
  ownership before local runs; CI runners are isolated.
- **Orphaned dev servers** from this worktree poisoning runs (kill the watcher
  tree before local runs).
- **Truncate vs live API connection** — better-sqlite3 serializes writes; the
  API is idle between tests so no lock contention. db-seed.ts precedent.
- **CI e2e <5m total**: current job ~3m. Adding ~5 specs (~1m) keeps it under.
- **Flaky selectors in new flows** (invoice line items, transfer, consolidation)
  — mitigate by probing the live UI before finalizing selectors, and by CI
  retries (2).
