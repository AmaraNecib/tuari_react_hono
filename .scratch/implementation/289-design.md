# Issue #289 — Payment module: validate non-zero/non-negative amounts, allocations, and page limit

**Tier:** High-assurance (financially-adjacent — payment amounts, invoice settlement)
**Base:** `bb144f3` (origin/develop) — branch `refactor/issue-289`
**Origin:** identified during the #249 debate (critic #10) + test-audit (edge-case hunter);
evidence in `.scratch/reviews/249/20bc48e-*`.

## Problem

`apps/api/src/modules/payment/payment.module.ts` is a service seam that validates
NOTHING about amounts. The ORPC wire gate (`packages/contracts/src/payment.ts`)
already rejects non-positive amounts, empty allocations, and `limit < 1` — so the
gaps are unreachable over the wire TODAY, but any direct module caller (integration
tests, future services, a mis-wired handler) can create financially invalid state:

1. 🔴 `create({ totalAmount: 0, allocations: [] })` → sum `0 === 0` passes → a
   payment row with zero allocations is recorded and listable ("phantom payment").
2. 🟠 Zero/negative allocation amounts: `-5000/-5000` and `0/0` pass the sum check,
   `group.total > remainingAmount` never fires for ≤0, and `recordInvoicePayment`
   books a zero/negative debt entry (may even flip an invoice via
   `newRemainingAmount <= 0`).
3. 🟠 `listPaged({ limit: -1 })` → `slice(0, -1)` silently drops the last row.
4. 🟡 `delete` TOCTOU: `findById → findAllocationsByPaymentId → deletePayment` is
   check-then-act across unlocked reads. A `create` for the same payment id that
   commits between the allocation check and `deletePayment` has its fresh
   allocation + payment silently cascade-deleted, leaving the invoice PAID and the
   debt entry booked with no payment row.

## Design decisions

### 1. Service-boundary defense-in-depth via shared contract primitives

Follow the #226 pattern (bootstrap.service.ts reuses `authBootstrapInputSchema`
via `safeParse`): the module seam reuses the SAME zod validity definitions as the
wire gate so the two enforcement points cannot drift.

The module's `CreatePaymentInput` deliberately treats ids as opaque strings
(no uuid constraint at the seam — existing tests use short ids), so we cannot
`safeParse` the whole `createPaymentInputSchema` at the seam. Instead we extract
the *financial* constraints into shared primitives in `packages/contracts/src/payment.ts`
and reuse them in both the contract schemas and the module:

- `paymentAmountSchema = z.number().positive().max(Number.MAX_SAFE_INTEGER)` — used
  for `paymentSchema.totalAmount`, `paymentAllocationSchema.amount`,
  `createPaymentInputSchema.totalAmount`, `createPaymentAllocationInputSchema.amount`,
  and by the module. The `.max()` cap keeps amounts inside the integer precision
  range the strict `!==` sum check and sqlite REAL columns represent exactly
  (test-audit finding: `2**53` amounts previously passed).
- `paymentListLimitSchema = z.number().int().min(1).max(100)` — used for
  `paymentListInputSchema.limit` (with `.default(50)` kept) and by the module.
  `.int()` closes a wire-reachable 500: sqlite `LIMIT ?` throws a datatype
  mismatch on fractional bounds like 2.5 (test-audit finding, verified empirically).

The module throws new typed errors (`PaymentInvalidAmountError`,
`PaymentEmptyAllocationsError`, `PaymentInvalidLimitError`) BEFORE the existing
sum-mismatch check so the specific invalid input is reported, not a confusing
mismatch. Pure-input validation → runs outside the transaction.

### 2. `listPaged` validates the limit at the seam

Module validates `query.limit` with `paymentListLimitSchema.safeParse` before
cursor decoding. Covers `limit ≤ 0`, negatives, NaN, and over-max — the exact
`slice(0, -1)` silent-drop case.

### 3. `delete` becomes atomic — guarded delete moves into the repository transaction

Replace the module's check-then-act with a single repository operation that runs
inside ONE lock-held transaction (`deleteIfUnallocated`), returning a discriminated
result (mirrors the "port result types mirror wire output shape" principle):

```ts
type PaymentDeleteResult =
  | { status: "DELETED" }
  | { status: "NOT_FOUND" }
  | { status: "HAS_ALLOCATIONS"; count: number };
```

Because `create` (via `runInTransaction`) and `deleteIfUnallocated` both serialize
through the connection-wide FIFO lock, the guard can no longer observe a stale
pre-transaction allocation state — the check and the delete are one critical
section. Cross-process, the sync `db.transaction` under `BEGIN` keeps the existing
`deletePayment` mechanism (unchanged semantics for the write itself).

- Module `delete` maps `NOT_FOUND` → `PaymentNotFoundError`, `HAS_ALLOCATIONS` →
  `PaymentHasAllocationsError(id, count)` (count now comes from the atomic result,
  not a follow-up read).
- `deletePayment` is REMOVED from the repository port (only the module called it);
  `findAllocationsByPaymentId` stays (legitimate read surface, pinned by repo tests).

### 4. Handler error mapping (defense-in-depth)

- `paymentsCreate` audit mapper: add `PaymentInvalidAmountError` and
  `PaymentEmptyAllocationsError` → `BAD_REQUEST`.
- `paymentsList`: map `PaymentInvalidLimitError` → `BAD_REQUEST` (it has no audit
  wrapper today; a module validation error must never escape as a 500).

## Files touched

| File | Change |
|---|---|
| `packages/contracts/src/payment.ts` | extract `paymentAmountSchema`, `paymentListLimitSchema`; reuse in all four amount fields + limit |
| `apps/api/src/modules/payment/payment.types.ts` | add 3 typed errors; add `PaymentDeleteResult` |
| `apps/api/src/modules/payment/payment.module.ts` | seam validation (create + listPaged); atomic delete |
| `apps/api/src/modules/payment/payment.repository.ts` | `deletePayment` → `deleteIfUnallocated` |
| `apps/api/src/modules/payment/adapters/payment.repository.ts` | guarded atomic delete (sqlite) |
| `apps/api/src/modules/payment/adapters/in-memory-payment.repository.ts` | guarded delete (in-memory) |
| `apps/api/src/rpc/handlers/payment.ts` | map the 3 new errors to BAD_REQUEST |
| tests | see below |

## Planned tests

**Module seam (in-memory, `payment.module.test.ts`)**
- `create` rejects empty allocations → `PaymentEmptyAllocationsError`
- `create` rejects `totalAmount` 0 and negative → `PaymentInvalidAmountError`
- `create` rejects allocation amount 0 and negative → `PaymentInvalidAmountError`
- `listPaged` rejects `limit` 0, −1, and >100 → `PaymentInvalidLimitError`
- existing create/list/delete tests keep passing (regression)

**Real sqlite adapter (`payment.module.sqlite.test.ts`)**
- delete refuses a payment that gained allocations; payment + allocation rows and
  invoice/debt state remain intact (guarded delete on the real transaction code)

**Repository (`adapters/payment.repository.test.ts`)**
- `deleteIfUnallocated`: `NOT_FOUND` for missing id; `HAS_ALLOCATIONS` (with exact
  count) deletes nothing; `DELETED` removes an unallocated payment

**Wire gate — black-box RPC (`rpc/router.test.ts`)**
- `paymentsCreate` with empty allocations / zero total / negative allocation →
  `BAD_REQUEST` (full auth+permission+gate path)
- `paymentsList` with `limit: 0` / `limit: -1` → `BAD_REQUEST`
  (these pin the user-facing path; the web app has no payment UI today, so the RPC
  layer is the user-facing surface)

**Contracts (`packages/contracts/src/index.test.ts`)** — existing payment schema
tests must keep passing after the shared-schema refactor.

## E2E (Playwright) — not applicable, documented

No web (or desktop) UI calls `paymentsCreate`/`paymentsList`/`paymentsDelete`
today (verified: `rg payments apps/web/src apps/desktop/src-tauri/src` → no
callers; the web `debts` feature uses a different debt-entry payment flow). The
user-facing surface for this module is the RPC wire gate, which is pinned
black-box in `router.test.ts`. A Playwright spec would only re-test the wire gate
through a UI that cannot produce the invalid inputs.

## Risks / notes

- **Behavior change for direct module callers**: invalid financial input now
  throws instead of persisting. No production caller is affected (wire gate
  already blocked these inputs; the handler passes only gate-validated input).
- **`PaymentHasAllocationsError` message**: count now sourced from the atomic
  result — message quality preserved, no follow-up read.
- **Coverage**: `payment.module.ts` sits in the 100% threshold include
  (`src/modules/payment/**` excluding `adapters/` and `*.types.ts`); the new
  branches in the module and handlers must be covered by the tests above.
- **No Rust Core / desktop changes** — API + contracts only.

## Verification

- `pnpm --filter @tuari/contracts build` (regenerates dist consumed by the API)
- `pnpm typecheck && pnpm lint && pnpm test:api && pnpm test:web`
- Full local e2e not required (no user-facing flow changed); `pnpm test:e2e`
  only if the guard deems it necessary.
