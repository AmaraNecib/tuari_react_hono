# Plan 006 — Reliability, Correctness, and Test Coverage

**Date:** 2026-04-29  
**Status:** Active  
**Priority:** High  
**Scope:** Service-layer auth guards, atomic inventory operations, financial unit tests, E2E test suite, ORM unification, audit log UI, optimistic updates

---

## Context

This plan captures the items from the 2026-04-29 full codebase review that are not covered by Plan 005. Plan 005 handles storage hardening, desktop auth boundary, maintainability decomposition, query segmentation, and bundle modularization.

**Already completed as part of the review session (not in this plan):**
- Rate limiting added to `/api/auth/*` routes (`SlidingWindowRateLimiter`, 30 req / 15 min per IP)
- React `ErrorBoundary` component added; wraps `HomeViewPageContent` in `home-view.tsx`
- File path traversal already protected in `inventory.storage.ts` (was already done)
- Double-submit prevention already implemented on all mutation-triggering forms

---

## Baseline Requirements

All phases must preserve:

1. `pnpm lint` passes
2. `pnpm typecheck` passes
3. `pnpm test` passes
4. `pnpm build` passes
5. No secret values introduced into tracked files

---

## Phase Order

1. **Phase 1 — Service-layer authorization guards**
2. **Phase 2 — Atomic inventory receive operation**
3. **Phase 3 — Financial calculation unit tests**
4. **Phase 4 — Audit log UI page**
5. **Phase 5 — E2E test suite (Playwright)**
6. **Phase 6 — ORM unification strategy**

---

## Phase 1 — Service-layer Authorization Guards

### Problem

Authorization (`requireWorkspaceAdmin`) is checked only in `router.ts`. If any service method is called outside the router (migration scripts, test helpers, future admin CLI), it executes with no authorization check. This is defense-in-depth failure.

### Target

Each mutating service method receives the actor ID and asserts bootstrap ownership before executing business logic. Read methods do not require actor validation (they are already protected at the router boundary).

### Required changes

**`apps/api/src/modules/company/company.service.ts`**

1. Inject an `AuthBootstrapService` (or a narrow interface `{ isBootstrapOwner(id: string): Promise<boolean> }`) into `CompanyService`.
2. Add a private `assertWorkspaceAdmin(actorUserId: string | null | undefined)` method that throws `CompanyError("UNAUTHORIZED", ...)` if the check fails.
3. Call `await this.assertWorkspaceAdmin(auditContext.actorUserId)` at the top of every mutating method (create, update, delete, assign, end).

**`apps/api/src/modules/inventory/inventory.service.ts`**

Same pattern: inject auth assertion, call it in every mutating method.

**`apps/api/src/app/dependencies.ts`**

Pass `authBootstrapService` into `CompanyService` and `InventoryService` constructors.

**`apps/api/src/rpc/router.ts`**

`createMutationAuditContext` already resolves admin status; keep it as a second layer. Do not remove router-level checks.

### Tests

Add to `company.service.test.ts`:
- Calling a mutating method with `actorUserId: null` throws `UNAUTHORIZED`
- Calling a mutating method with a non-admin ID throws `UNAUTHORIZED`
- Calling a mutating method with a valid admin ID proceeds normally

### Done criteria

1. Every mutating service method asserts workspace admin before executing
2. Tests cover the three scenarios above
3. Workspace remains green

---

## Phase 2 — Atomic Inventory Receive Operation

### Problem

Adding inventory (purchasing items and assigning them to a location) involves:
1. Creating or finding an `ItemDefinition`
2. Creating an `InvoiceGroup`
3. Recording a `PURCHASE` inventory movement

If step 3 fails after step 2, the DB has an orphan `InvoiceGroup` with no items linked. There is no wrapping transaction across all three.

### Target

A single `receiveInventory(input, auditContext)` method on `InventoryService` that wraps all three steps in one database transaction. The individual steps remain available for independent use.

### Required changes

**`apps/api/src/modules/inventory/inventory.repository.ts`**

Expose a `withTransaction(fn)` method if not already present, mirroring the company repository pattern.

**`apps/api/src/modules/inventory/inventory.service.ts`**

Add:
```typescript
async receiveInventory(input: ReceiveInventoryInput, auditContext: MutationAuditContext) {
  return this.repository.withTransaction((tx) => {
    const definition = this.ensureItemDefinition(tx, input.itemDefinitionId, auditContext)
    const invoiceGroup = this.createInvoiceGroup(tx, input.invoiceGroup, auditContext)
    return this.createPurchaseMovement(tx, {
      itemDefinitionId: definition.id,
      invoiceGroupId: invoiceGroup.id,
      locationId: input.locationId,
      quantity: input.quantity,
      unitAmountDzd: input.unitAmountDzd,
    }, auditContext)
  })
}
```

**`packages/contracts/src/index.ts`** (or feature module after Phase 3 of 005)

Add `receiveInventoryContract` procedure if the frontend needs to call this as a single operation.

**`apps/api/src/rpc/router.ts`**

Add `inventoryReceive` handler that calls `inventoryService.receiveInventory(...)`.

### Tests

Add to `inventory.service.test.ts`:
- If `createPurchaseMovement` fails, `InvoiceGroup` is not persisted
- Successful receive creates all three records atomically

### Done criteria

1. Receive operation is atomic — partial failure leaves no orphan records
2. Tests verify atomicity
3. Workspace remains green

---

## Phase 3 — Financial Calculation Unit Tests

### Problem

Salary payment, debt balance, and debt settlement are financial calculations with no dedicated unit tests. A regression in these areas is invisible.

### Target

Table-driven unit tests covering all boundary conditions for:
- Salary payment recording
- Debt balance computation after entries
- Debt account settlement (balance reaches zero)
- Debt entry backdating prevention

### Test file targets

**`apps/api/src/modules/company/company.service.test.ts`**

Add test cases:

```
Salary:
- record payment with valid amount → balance updated
- record payment with zero amount → VALIDATION error
- record payment with negative amount → VALIDATION error

Debt balance:
- single positive entry → balance equals entry amount
- mixed positive and negative entries → correct net balance
- payment exactly equal to balance → status becomes SETTLED
- payment exceeding balance → allowed (debit side)

Debt backdating:
- entry date before latest entry date → BUSINESS_RULE error
- entry date equal to latest entry date → allowed
- entry date after latest entry date → allowed
- no previous entries → any date allowed

Debt settlement:
- settle open account → status becomes SETTLED
- settle already-settled account → CONFLICT error
```

### Done criteria

1. All test cases above pass
2. No behavior changes — tests document existing correct behavior

---

## Phase 4 — Audit Log UI Page

### Problem

`system_logs` table exists and `systemLogList` RPC endpoint is implemented and queryable. There is no frontend page for it. Administrators cannot see what changed, who changed it, or when.

### Target

A read-only audit log page at the "transactions" / system log section, accessible from the workspace sidebar.

### Required changes

**`apps/web/src/features/app-shell/system-log-section.tsx`**

Currently minimal or placeholder. Build out:
- Table with columns: date/time, actor, action, entity type, entity ID
- Filter controls: date range, actor name
- Pagination controls (use existing `table-pagination-controls.tsx`)
- Empty state and loading state

**`apps/web/src/features/app-shell/home-view-page-content*.tsx`**

Wire system log section into the page content for the relevant page route.

**Copy / i18n**

Add missing translation keys for audit log column headers and filter labels.

### Done criteria

1. Admin can navigate to audit log and see a paginated list of system events
2. Date range and actor filters work
3. No regressions in other sections

---

## Phase 5 — E2E Test Suite (Playwright)

### Problem

32 unit/integration test files exist but zero end-to-end tests cover real user flows. A regression in sign-in, employee creation, or inventory transfer is invisible until reported by a user.

### Target

Playwright test suite covering five critical paths:

1. **Sign-in** — enter phone + password → session established → workspace loads
2. **Create employee** — fill form → submit → employee appears in list
3. **Create project** → project appears in list
4. **Transfer inventory** — select item → select source/destination → transfer succeeds → location contents updated
5. **Record debt entry** → balance updated in party ledger

### Setup

**Root `playwright.config.ts`** (may already exist)

Configure:
- `baseURL` pointing to dev server
- Retry on CI: 2
- Reporter: html

**`e2e/`** directory at repo root:
- `auth.spec.ts`
- `employees.spec.ts`
- `projects.spec.ts`
- `inventory.spec.ts`
- `debts.spec.ts`

Each spec should:
1. Set up a fresh test user via the bootstrap endpoint before tests
2. Clean up after via a reset endpoint or test DB snapshot
3. Use `page.getByRole` and `page.getByText` — avoid CSS selectors

### Done criteria

1. All five critical paths have passing Playwright tests
2. Tests run in CI (`pnpm test:e2e`)
3. Tests are isolated — each spec starts from a clean state

---

## Phase 6 — ORM Unification Strategy

### Problem

`AccountRepository` uses Prisma. `CompanyRepository` and `InventoryRepository` use raw `better-sqlite3` SQL. Two data access patterns for the same database. Future contributors don't know which pattern to follow.

### Decision required (before implementation)

Evaluate:

| Option | Pros | Cons |
|---|---|---|
| Migrate all to Prisma | Single pattern, type-safe queries, migrations built-in | Performance overhead for complex queries, loses fine-grained SQL control |
| Migrate all to raw SQL | Maximum control, no ORM overhead | Manual type mapping, harder to maintain schema |
| Formalize the split (ORM for auth, raw for business) | Clear boundary, no migration needed | Must document WHY explicitly |

**Recommended:** Formalize the split — Prisma for better-auth-managed models (User, Session, Account, Verification), raw `better-sqlite3` for all business domain models. Document this as an architectural decision in `ARCHITECTURE.md` or `CLAUDE.md`.

### Required changes (formalized split option)

1. Add `docs/architecture-decisions.md` with:
   - Decision: Prisma for auth models, raw SQL for business models
   - Rationale: better-auth owns the Prisma schema for its tables; business queries benefit from explicit SQL control
   - Consequences: contributors must check which layer to use; repository tests must cover both

2. Add a lint rule or comment in `company.repository.ts` and `inventory.repository.ts` directing future contributors to use raw SQL for new business queries.

3. Ensure `AccountRepository` does not grow business logic (keep it account/profile only).

### Done criteria

1. The ORM split is documented and justified
2. No cross-contamination (business logic in Prisma models or auth logic in raw SQL)
3. Contributor guidance is clear

---

## Testing Strategy

For every phase:

1. Run targeted tests for the changed module first
2. Then `pnpm typecheck`
3. Then `pnpm test` (full suite)
4. Then `pnpm build`

---

## Commit Strategy

One commit per phase. Do not mix phases. Prefix: `feat:`, `fix:`, `test:`, or `docs:` as appropriate.

---

## Immediate Next Action

Start with **Phase 1 — Service-layer authorization guards** since it has the highest security impact and is self-contained within the service layer.
