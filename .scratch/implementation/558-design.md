# Salary payments and attributable settlement, issue #558

## Status and authority

Draft implementation plan under comparison with preserved #427 decisions. The owner instructed this thread to inspect and reuse #427's design unless a concrete improvement is justified, and authorized independent agent opinions. Prior explicit approvals carry forward; this note does not itself authorize a new financial contract or production activation. The normal-app acceptance remains incomplete.

Worktree: `D:/worktrees/tuari_react_hono/t3-48d661ef-3ae352d3d2c079c6`.
Base and inspected origin/develop: `6f8e0249e40df9ad3b1f891b3181030422251028`.
Verification mode: `focused-local / CI-final-pending`, as recorded by the current workflow and activation record. Effective hosted protection has not been inspected in this investigation.
Tier: high-assurance. Reachable risks are duplicate cash, incorrect obligation direction, lost history, partial aggregate writes and duplicated project labor cost.

This is a design-only checkpoint. No application behavior or tests changed. No payment acceptance, review verdict, publication or merge is claimed.

## Current source and reuse decision

The live #558, #544, #427, #527 and #530 issue bodies were inspected. #543's merged implementation is present in the base. #527 remains open; its representation scope must not become a second earning implementation.

`WorkforceService.approveEmployeeEarning` and `EmployeeEarningRepository` own normal-app approvals. Their existing identities are `employee_earning` and ordered `employee_earning_segment` rows. The approval is immutable and does not write a debt or payment. `createSalaryPayment` refuses new legacy numeric payments. Existing salary payment records remain history, not newly inferred wages or advances.

`SqliteEmployeeEarningRepository` persists exact integer amounts and returns exact strings. The project-cost repository consumes approved project segments. Payment must not insert segments, change approved allocations or use the salary reference to derive an obligation.

`ExactFinanceService` already supports producer-owned original obligations, target-linked partial payments, remaining amounts, explicit corrections, void attribution and durable aggregate replay. `runAggregate` checks a shared connection and FIFO identity. Producer types already include `PAYROLL_EARNINGS`, `PAYROLL_OPENING` and `PAYROLL_ADVANCE`.

However, normal `AppDependencies` still composes `FinanceService` against the legacy ledger. `createExactCommerceComposition` is explicitly opt-in. `exactDebtSchemaStatements` uses the existing debt table identities with different integer columns; it is fresh-copy preparation, not production initialization. `SqliteExactFinanceRepository` requires the debt exact-schema marker. It cannot simply attach to the current initialized database.

Preserved branch `feat/issue-427-independent` was inspected at `bb4aa26e64294278b41b530492e28efe2ef7ce51`. Its `PayrollCashService`, repository and SQLite adapter provide useful command and provenance patterns. They depend on a different `ExactWorkforceRepository` earning shape with embedded debt links and use `currency`/`approvedAmount`, unlike today's `currencyCode`/`totalAmount`. They also include opening entry and earning correction operations belonging outside #558. Do not cherry-pick that branch or copy its workforce schema wholesale.

The preserved backend handoff explicitly reports a missing combined lifecycle materialization budget and incomplete corrupt-link and rollback cases. Its historical test results and CI-final-enforced claim do not verify this worktree. Reuse is subject to fresh adaptation and proof.

## Proposed domain and storage design

Keep one authoritative finance ledger. Cash records describe cash events, allocations describe attribution and finance entries own settlement balances. No payroll balance cache, numeric writer or second debt ledger is introduced.

1. Keep existing employee and earning records unchanged. Add an immutable, unique earning-to-original-debt link. For a positive approved earning, its linked original is a DZD worker PAYABLE owned by `PAYROLL_EARNINGS` and that earning ID. Zero approvals require no zero-valued posting. Link creation is atomic and idempotent; it uses the explicit approved total, never a reference or old cash history. Whether existing approvals are linked eagerly or on first payment is an owner-approved integration decision, not an implicit backfill.
2. Adapt preserved cash provenance into exact cash headers, ordered wage allocations, explicit advance sources and advance repayment records. Each allocation links the cash event, original earning or opening source, original debt entry and payment entry. Store Money2 as bounded int64 minor units and wire values as strings. Immutable source amounts describe the event; remaining balances are derived only from the linked ledger entries.
3. Cash must reconcile exactly to explicit wage allocations plus an optional recoverable advance. Wage allocations cannot exceed their selected source remainders. No automatic cross-source selection or netting occurs. Extra cash is refused until the operator approves an attributed bonus or explicitly classifies the excess as an advance. A bonus uses the existing earning approval flow before payment and requires project attribution for the bonus under #558's stricter acceptance. A failed payment does not erase that separately approved earning.
4. Advances create positive worker RECEIVABLE obligations owned by `PAYROLL_ADVANCE`. Recovery records a separate, explicit payment against the selected advance source. This first interface represents cash repayment, not automatic wage withholding. It validates employee, direction, currency, producer, original-entry status and remaining amount before writing.
5. No physical deletion or in-place monetary edit is exposed. Initially refuse payment/settlement correction or reversal until a dedicated attributable reversal command is approved. Generic finance RPC must not mutate payroll-owned originals or payments. Preserve the event and audit history. Opening-balance corrections and earning corrections are not implemented here.

The earning link stores attribution, not another earned total. The cash allocation amount is the immutable cash split, not a second current balance. Unallocated earnings remain part of approved wages, but do not contribute to project labor cost until an explicitly authorized allocation operation exists.

## Proposed interface and transaction ownership

Adapt the preserved payroll module behind a small interface: record cash, repay a selected advance, and read an employee lifecycle. Input uses existing employee/earning IDs, a stable request ID, exact DZD strings, a payment date and explicit ordered source allocations. Server middleware supplies actor and transaction audit data; clients cannot select them.

Reserve source kinds for approved earnings, opening wages and opening advances. #545 supplies opening source resolution and opening review state. An absent review remains UNREVIEWED with a nonblocking reminder, never confirmed zero. #558 does not add opening-balance entry or correction commands. Unknown opening source IDs fail closed until their provider exists.

Use `ExactFinanceService.runAggregate` for one synchronous transaction covering source validation, ledger changes, provenance and durable result. Every participating adapter shares the same physical connection and FIFO. Acquire the immediate write reservation before checking receipts, source remainders or links. A canonical fingerprint includes actor and domain intent, with normalized timestamps and money; a changed payload or actor conflicts. Retrying the same frozen intent returns the original result after response loss. UI pending intent survives reload until a definite outcome.

The payroll module owns reconciliation and ledger/source validation once. RPC, employee history and payment forms call that interface. Deleting it would duplicate those rules across callers. Reuse the real SQLite adapter and a focused in-memory adapter only where useful for domain tests; do not add a pass-through workforce implementation or replace existing earnings identities.

Normal-app UI starts from approved earnings with an optional Record payment action. Show approved, paid, outstanding wages and advances owed separately. Show unallocated earnings as project attribution, not payment state. Currency belongs beside values. Payment details expose dates, exact amounts, source allocations and audit identities. Preserve current approval/history routing, RTL and keyboard behavior.

## Activation gate and recommendation

Do not convert the normal debt schema inside #558, add parallel payroll debt tables, or cast exact amounts through the current REAL ledger. Coordinated exact-debt integration must cover connected debt, invoice and inventory readers/writers and its compatibility strategy. That is an owner-only schema/activation decision, with final release activation remaining #530.

Recommended sequence after design approval:

1. Adapt the payroll foundation to current earning identities in isolated prepared exact-schema tests, excluding opening/correction delivery. Keep production startup and legacy writers unchanged.
2. Prove the payroll interface and authenticated router against the real exact finance adapter. Prepare the normal-app payment UI against that same contract, without a fake success path.
3. Mount the payment flow only when owner-approved coordinated exact-debt composition is available. Then prove the connected normal authenticated UI/API/database path before claiming #558 complete.

Steps 1 and 2 are partial foundation work, not issue closure. A feature flag or inert test composition cannot satisfy the ticket's normal-app acceptance. Owner approval is needed before concrete schema/API implementation; this note does not silently expand #558 into application-wide activation.

## Proof required after approval

Use focused failing-first tests and actual authenticated contracts. Native SQLite tests must use factory-backed plain and encrypted databases, write/close/reopen and independent expected amounts. Preserve failed-attempt logs and record exact SHA, commands, exit codes, counts and durations under ignored `.scratch/reviews/558/`.

- Earnings 35,000, reference 30,000 and cash 25,000 leave 10,000 wages owed. Multiple later payments reach zero while project cost stays 35,000. Approval alone creates no cash. Explicit unallocated amounts remain distinct from unpaid wages.
- Cash 40,000 against 35,000 requires a separately approved attributed 5,000 bonus or explicit 5,000 advance. Advances leave labor cost unchanged. Advance recovery never consumes a wage obligation or silently nets either direction.
- Reject wrong employee, account direction, currency, producer and source link; voided/missing originals; unauthorized reads/writes; malformed, overprecision, zero/negative cash and overflowing amounts. Validate total reconciliation and per-source bounds.
- Duplicate requests and response-loss retries create one event. Changed intent/actor conflicts. Inject failures after individual ledger/source/receipt writes and prove whole-aggregate rollback. Test competing connections, immutable update/delete/replace attempts and bounded lifecycle reads before hydration.
- UI cases cover optional payment after approval, partial/repeated payment, excess classification, permission/error states, persistent pending intent, reload/drill-down and nonblocking unreviewed reminder. Run the existing E2E selector before selecting browser cases; route justified browser work through `heavy_run`.

Relevant lint, typecheck and exact monetary inventory checks accompany affected tests. Full suites and builds remain CI-final unless a documented gap justifies expansion. Commit complete source before three distinct initial review sessions, debate, test-audit and code-review. Then apply bounded corrections, scoped architecture review and Guard verification. Hosted current-head acceptance, protection and review remain separate gates.

## Applied lessons and open approval

Applied the transaction-reservation lesson and nested-transaction composition lesson after checking the current finance interface. Historical branch handoffs are reuse evidence only, not current policy or test proof.

Do not request approval again for decisions already resolved in #427. Compare and carry those decisions forward before implementing. Only a genuinely new contract, schema adaptation or activation decision needs a concrete owner proposal.

## Recovered #427 authority and corrections to this draft

The preserved `527-design.md` section "Owner-resolved cash source and fresh-workspace authority" explicitly records approval for `employee_salary_cash`, `employee_salary_payment_allocation` and `employee_salary_advance`, with the existing finance ledger authoritative for obligations, remaining amounts and replay. It explicitly closes the earlier cash-source compatibility blocker. The preserved `427-design.md` records approval of one existing debt source and separate wages/advance directions. Its earlier decimal-TEXT and pending-storage statements are historical; the accepted exact-money ADR supersedes them.

My earlier request for blanket design approval was premature. Reusing those approved cash provenance records is not a new proposal merely because the implementation must adapt to current earning identities. Production activation and the current earning-to-debt link still need a concrete integration design; they must not block investigation or already-approved isolated foundation work.

The preserved design also names explicit advance-against-wages settlement as linked reductions to both directions in one transaction, without cash or new labor cost. The cash-repayment-only proposal above must not silently narrow that behavior. The independent assessment will distinguish the already-approved domain behavior from the additional command/storage implementation needed for it. No settlement policy is changed by this draft.

The independent read-only Luna assessment completed against base `6f8e0249e40df9ad3b1f891b3181030422251028` and preserved source `bb4aa26e64294278b41b530492e28efe2ef7ce51`. It recommends keeping the approved cash-source design, adapting it to current earnings, and deferring normal-app mounting. It independently confirms the combined read-budget gap, distinct cash/posting dates and missing corruption/rollback proof. This is design advice, not a final implementation review.

## First implementation slice

Implement only the already-approved immutable cash provenance storage in an isolated prepared exact-schema composition. Reuse the preserved cash, allocation, advance and repayment source shapes, adapting imports and names to the current repository. Add no replacement earning schema and no new earning-to-debt link writer yet. The first slice accepts validated source links from its caller; subsequent payroll orchestration must verify them against current earning identities and exact finance before any normal-app mount.

Keep DTOs internal to the payroll module in this slice. Do not add public RPC contracts, production initializer changes, schema-marker activation or root wiring. Opening entry/correction tables stay outside the slice. Preserve source-kind integration points without pretending an opening provider exists. Test immutable persistence, exact large amounts, combined pre-hydration read bounds, atomic writes and plain/keyed close/reopen. Source consistency checks possible within the storage interface must fail closed.

The source-owning worker commits this bounded implementation with its design note and focused evidence. Parent integration, all three current-head initial lenses and Guard remain required before reporting local readiness. This slice does not complete #558 or resolve the later earning-to-ledger integration decision.
