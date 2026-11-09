# Issue 478 outbound money inputs

## Scope and state

- Worktree: `D:/worktrees/tuari_react_hono/t3-3eda18f7`.
- Branch: `fix/issue-478`. Base: `ec0064c77c9ce381534c45327d04e1ebae35e712`, equal to freshly fetched `origin/develop`.
- Spec: issue #478. PR #477 is merged and its outbound allocation changes are in this base. Preserve that allocation behavior.
- Tier: High-assurance. An unbounded outbound opening balance can persist money that report aggregates refuse to use.
- Verification: `focused-local / CI-final-pending`. Protection inspection returned HTTP 404, Branch not protected. No protection changes or merge are authorized by this implementation.

## Design

Use `nonNegativePaymentAmountSchema.optional()` for `unitPriceDzd`, `debtAmountDzd`, and `firstPaymentAmountDzd`. Enforce the same schema with the existing `normalizeMoneyWithinBound` at `InventoryService.createOutboundTransfer`, before transaction writes. Keep zero legal and optional inputs optional. Only undefined defaults to zero for debt and first payment; explicit null must reach the shared schema and fail for direct callers just as it does at the RPC contract. Keep the first-payment versus opening-balance comparison.

The domain terms are unchanged. Debt amount is the full transfer value posted as OPENING; first payment is posted separately as PAYMENT. Unit price is an optional stored transfer-item price. This work adds no aggregate-price calculation, response restriction, database migration, or finance-module policy.

The existing money schema provides locality across the wire and direct module callers. Deleting it would distribute the magnitude rule across those callers. No new adapter or interface is needed. Architecture: no seam moved.

Applied wisdom: `a-money-bound-on-a-derived-default-must-also-bound-the-field-it-derives-from.md`. Follow the money source into the outbound debt opening and reuse the shared write schema. Stored response values remain permissive. Aggregate guards already exist; widening this issue into report-total policy is out of scope.

## Proof

The issue names the existing contract and write seam, which are the test interfaces. Add failing-first contract cases for each field above the maximum, then service cases through the real SQLite adapter proving typed field errors and unchanged stock, debt, transfers, movements, and audit state. Preserve rejection of negative and non-finite values. Cover maximum, zero, fractional and omitted values, plus first-payment comparison with existing debt-sign tests.

Run the focused contract file and outbound availability/debt-sign integration files. Compile contracts because the API consumes its generated distribution. Run contracts and API typecheck plus lint on the changed API files. The E2E selector returns full scope because contracts are a critical path. Full browser coverage remains CI-final. No UI, routing, serialization or handler wiring changed; contract parsing and the real SQLite module tests directly exercise every changed money gate. No concrete browser-only uncertainty justifies a full local browser run. Run the unchanged debt-sign integration tests as direct-caller regression coverage.

Commit complete source, tests and this note. Run debate, test-audit and code-review in separate read-only sessions against the source-owning worktree and committed SHA. Record exact-tree commands, raw logs and review results under ignored `.scratch/reviews/issue-478/`. Same-family separate-session review uses the owner's standing independence approval when no enabled non-author route is available. No review report is published or committed.
