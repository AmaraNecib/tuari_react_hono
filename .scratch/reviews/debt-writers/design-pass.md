# Design pass — debt writers lane

Run against the lane's own diff (server-side D2 + D1a/D3/D4/D7/D8), per the
standing rule. Lenses: `domain-modeling`, `codebase-design`,
`improve-codebase-architecture`.

## Fixed in this PR

- **Dead repository method (deletion test).** D3 added
  `getDebtAccountByWorkerIdAndDirection` and the only production caller of
  `getDebtAccountByWorkerId` disappeared. The old method was still declared on
  `FinanceRepository` and implemented/delegated in four adapters with no caller
  or test. Deleting it removes five pass-through declarations and no complexity
  reappears. Removed.
- **Two accessors for one rule.** `debtReasonCategoryDirectionMap` had both
  `deriveDirectionFromCategory` (throwing, unused in production) and the new
  `getLockedDirectionForCategory` (null-returning, used by the service and the
  contract). Two ways to read one rule is how a rule drifts. Removed
  `deriveDirectionFromCategory`; `getLockedDirectionForCategory` is now the one
  accessor, and callers that need to reject `null` branch themselves.
- **Duplicated service input type.** `createOutboundTransfer` carried a
  hand-written copy of `inventoryOutboundTransferCreateInputSchema`'s shape.
  Adding `firstPaymentAmountDzd` had to be done twice, which is exactly the
  drift the rule warns about. The parameter is now typed as the contract's
  `InventoryOutboundTransferCreateInput`, so the wire schema and the service
  agree by construction.

## Findings (recommend follow-up, not fixed here)

1. **The category→direction rule still has a second copy in the web client.**
   `apps/web/src/features/debts/debt-create-page.tsx` hand-maintains
   `DEBT_CATEGORIES[].impliedDirection`, a copy of
   `debtReasonCategoryDirectionMap`. This PR flips the one entry that must move
   atomically with the server rejection (`SALARY_ADVANCE` → `RECEIVABLE`) and
   pins it with a client test, but the copy itself remains and will keep needing
   manual flips. Recommendation: the client derives from
   `getLockedDirectionForCategory` / the shared map instead of a local copy.
   Worth a small PR once the terminology lane lands.
2. **The purchase-debt invariant is emergent, not owned.**
   `currentBalance === remainingDebtDzd` holds only because `createInvoiceGroup`
   and `recordInvoicePayment` happen to write matching signs. The pairing lives
   in two methods with no single owner, so the next edit can break it silently.
   Recommendation: a small `applyInvoicePayment`-style deep module (or a
   `postPurchaseLedger` helper) that owns opening+payment and returns the pair,
   tested through that one seam. Bigger than this PR.
3. **The employee-debt read interface is shallower than the domain.** D3 lets a
   worker hold a PAYABLE and a RECEIVABLE ledger, but
   `employeeDebtAccountGet` returns one account and the panel shows one balance.
   Recommendation: return both ledgers (or take a direction) as part of the D9
   UI work.
4. **The outbound page multiplies the debt per source group.**
   `outbound-transfer-create-page-v2.tsx` loops `createOutboundTransfer` once
   per source location and sends the full `debtAmountDzd` and
   `firstPaymentAmountDzd` each time. Multi-source transfers already duplicated
   the debt; D8 also duplicates the first payment now. Pre-existing shape, real
   money bug. Recommendation: allocate the debt across the group calls (or send
   one transfer with all items). Own PR.
5. **Debt vocabulary has no glossary entry.** `CONTEXT.md` is scoped to
   diagnostics/telemetry; the debt canonical terms (PAYABLE, RECEIVABLE,
   direction, advance, opening, payment) live in
   `plans/PRD-bidirectional-counterparty-ledger.md`, whose `SALARY_ADVANCE` row
   now contradicts D1a. Recommendation: the parent updates the PRD row (and
   optionally adds a debt `CONTEXT.md`) when the terminology work lands; the
   code's single source is `debtReasonCategoryDirectionMap`.

## Nothing else found

No other shallow additions: `getLockedDirectionForCategory` is a small
accessor that centralises the "unconstrained → null" convention for two
callers; `resolveEmployeeEntryDirection` is a named four-branch domain rule with
one caller (deleting it would only move the rule back inline); the lower-level
`getDebtAccountByWorkerIdAndDirection` seam has two real adapters (sqlite and
in-memory); and the schema test that inserts a duplicate row directly is
deliberately crossing the service interface to pin the DB constraint, which is
the interface's guarantee.
