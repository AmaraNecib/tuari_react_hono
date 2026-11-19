# #558 cash provenance storage

Base: `6f8e0249e40df9ad3b1f891b3181030422251028`. Preserved #427 source: `bb4aa26e64294278b41b530492e28efe2ef7ce51`. Verification mode is `focused-local / CI-final-pending`. Tier is high-assurance because cash attribution can duplicate financial events or settle the wrong obligation direction.

## Scope and authority

Reuse the owner-approved `employee_salary_cash`, `employee_salary_payment_allocation`, `employee_salary_advance` and cash repayment provenance from preserved #427. Adapt the storage interface without replacing current `employee_earning` or `employee_earning_segment`. This is isolated exact-schema preparation, not normal-app mounting or issue completion. No production initializer, schema gate, public contract, earning approval, project cost or root composition changes.

The first worker's incomplete storage was committed at `ca871b69` and integrated as `46956837`. A continuation left partial changes uncommitted in its own worktree. The parent preserved that diff locally and completed the implementation and focused proof. Earlier setup failures and typecheck failures remain in ignored evidence. Neither worker's incomplete handoff is treated as verification.

## Domain and interface

A cash header records actual amount, date and audit. Ordered wage allocations link explicit earning/opening sources to original obligations and their ledger payments. Explicit advances link to worker RECEIVABLE originals. A settlement record in this slice describes cash repayment against a selected advance or opening advance. It does not implement advance-against-wages offset, which remains a separate orchestration requirement under #558. No cash record stores a salary reference, invented period, expected salary or derived balance.

The repository accepts source links from a trusted future payroll caller. It verifies the real exact finance physical schema, worker party, direction, currency, original status/provenance, payment status/provenance/target and exact amount. The same SQL predicates protect inserts and hydration. Source existence against current earning/opening providers remains the orchestration caller's responsibility; a producer ID alone is not proof that an earning or reviewed opening exists. No provider or earning-to-debt link writer is introduced here.

Finance owns balances, durable command replay and producer capabilities. Storage implements `ExactTransactionParticipant` on the injected connection and FIFO. Whole-command retry remains `ExactFinanceService.runAggregate`; the repository does not create another command receipt. Direct storage insertion is not itself a replayable application command.

## Physical invariants

Amounts use native bounded int64 minor units and statement-local exact reads. Internal validators reject nonpositive cash/children, invalid timestamps/audit identity, unsupported currency, duplicate allocation identity and unreconciled totals. Audit user/transaction fields preserve existing nullable semantics; non-null transaction IDs use the shared UUID validator. The actual cash timestamp is independent of finance posting time.

Allocation identity is composite cash ID plus allocation ID, as in the preserved design. Each ledger payment can be attributed only once in its provenance collection. Advance original identity is unique. Update, delete and replacement guards retain immutable event history even with recursive triggers disabled. No correction or reversal writer is exposed. Readback refuses externally voided or corrupt linked ledger history rather than fabricating a valid cash event; coordinated reversal remains future work, not a permanent business-policy refusal.

The cash collection budget counts headers, wage allocations and advances before hydration, with a combined maximum of 10,000. Single-cash reads and writes include the header and optional advance in this limit. Settlement collection reads separately cap settlement rows at 10,000. These are storage collection limits, not a claim of one combined employee lifecycle budget. Future lifecycle orchestration must budget the union of earnings, cash, advances, settlements and opening sources before loading it. Bounded collections currently fail closed, rather than returning a partial balance.

## Module design and proof

The storage interface localizes exact binding, immutable provenance, ledger link checks, read budgets and rollback. Deleting it would distribute those rules across future callers. The SQLite adapter is the only persistence implementation needed for this slice; no hypothetical in-memory adapter is added. Shared SQL predicates serve both schema triggers and adapter reads, so insert and hydration checks do not drift.

Focused native tests use real factory-backed plain/keyed files and the real exact finance schema and service. Tests cover large exact cents, ordered allocations, explicit advances, cash repayment, close/reopen, invalid input, wrong attribution/direction, changed ledger state, duplicate payment use, immutable update/delete/replace, child failure rollback, finance aggregate rollback, nested synchronous transactions, async/thenable refusal, foreign-flow FIFO refusal and pre-hydration budget rejection. No tests touch the configured application database.

Parent pre-commit proof passed 51 tests across the storage file and exact finance aggregate regression file, API typecheck and four-file ESLint. Raw logs remain ignored under `.scratch/reviews/558/`. Post-commit proof and required independent debate, test-audit and code-review are separate gates. No current-head review verdict, CI acceptance, publication, merge, application activation or #558 closure is claimed.

Applied lessons are immediate transaction reservation, shared FIFO/nested rollback and statement-local exact reads. Historical Number-cent advice is excluded in favor of current Money primitives. Architecture assessment remains scoped to this storage interface and its future orchestration caller.
