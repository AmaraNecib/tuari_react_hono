# Debt writers (PR #464) — two-axis code review

Range: `git diff bfb87fbd...HEAD`. Standards + Spec sub-agents on fresh
context, aggregated verbatim below (lightly cleaned), then the fixes in
`ed4ac123`.

## Standards

Hard violations found:

1. **`debtAmountDzd` doc contradicts the implementation — Blocker.** The added
   JSDoc in `packages/contracts/src/inventory.ts` read "the invoice/transfer
   value minus any first payment already collected", but `inventory.service.ts`
   says "the **full** transfer value" and `outbound-transfer-create-page-v2.tsx`
   passes `totalAmount`. A caller following the doc would double-subtract the
   first payment. **Fixed:** doc now says full transfer value, first payment
   posted separately via `firstPaymentAmountDzd`.
2. **D2 not enforced on the employee path — Hard.** `employeeDebtEntryCreateInputSchema`
   accepted `direction` + `reasonCategory` with no lock, and
   `resolveEmployeeEntryDirection` ignored `reasonCategory`. A client could send
   `reasonCategory:"SALARY_ADVANCE"` with `direction:"PAYABLE"`. **Fixed:** wire
   `superRefine` + service derivation both enforce the lock.
3. **Duplicated direction table — Hard (standard a: one derivation).**
   `debt-create-page.tsx` `DEBT_CATEGORIES[].impliedDirection` hand-copied the
   contracts map; the D1a flip had to be edited twice. **Fixed:** the page calls
   `getLockedDirectionForCategory(value)`.

Judgement calls:

- **Repeated signing law.** `entryType === "PAYMENT" ? -amount : amount` is
  re-implemented inline in `inventory.service.ts`. Deferred: a shared signer
  would touch the D5 invoice port (out of scope).
- **D2 lock implemented twice** (wire `superRefine` + service). Kept: the wire
  protects every HTTP caller, the service protects in-process callers. The
  duplicated Arabic message is now a shared constant, so wording cannot drift.
- **Feature Envy** in `resolveEmployeeEntryDirection` reaching into the
  repository balance. Kept: it is the point of the PAYMENT fallback.
- **`getEmployeeDebtAccount` returns `accounts[0]`** — now ambiguous under D3.
  Deferred (no live caller).
- **Raw enum in Arabic copy** — fixed (shared constant).

i18n: no violation. The diff adds no UI strings; the new Arabic literals are
server/domain messages matching the file convention.

## Spec

Verified correct after fixes:

- **D1a:** `SALARY_ADVANCE → RECEIVABLE` in `core.ts`, the web map, the
  employee ADVANCE path, and the integration fixture. The explicit-direction
  override that allowed a PAYABLE advance is now rejected.
- **D2:** rejection at the wire (`debtAccountCreateInputSchema` +
  `employeeDebtEntryCreateInputSchema`) and at the service
  (`createDebtAccount` + `createEmployeeDebtEntry`); an explicit direction with
  **no** category is still accepted (cases-panel shape), now pinned at the
  wire too.
- **D3:** `(worker_id, direction)` composite unique; direction-aware lookup in
  all four adapters; two worker ledgers coexist.
- **D4:** `OPENING +gross`, `PAYMENT −paid`; `currentBalance === remainingDebtDzd`
  on the 1000/400/600 and the 200/300/500 sequences.
- **D7:** PAYMENT subtracts on both ADVANCE/RECEIVABLE and OPENING/PAYABLE; any
  LIVE entry is payable.
- **D8:** `firstPaymentAmountDzd` reaches the ledger as a real PAYMENT.

No scope creep: `invoice-debt.port.ts` (D5) is untouched; no D9 terminology
work beyond the in-scope D1a map flip. `deriveDirectionFromCategory` was
renamed to `getLockedDirectionForCategory` (no remaining callers).

Residual spec notes (not defects):

- The purchase invariant is per-invoice on a shared counterparty ledger; a
  second invoice on the same `(counterparty, PAYABLE)` account accumulates, so
  a global `currentBalance === remainingDebtDzd` cannot hold. That is the
  existing per-counterparty ledger model and is D5 territory.
- `recordDebtPayment`'s `amountDzd > account.currentBalance` guard still works
  on the signed balance for both orientations.
