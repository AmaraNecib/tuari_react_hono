# #558 lifecycle reader and authenticated interface

## Authority and next boundaries

Base source is reviewed payroll foundation `ea849b4a1908299b8802cfdc7a5216750a58f2e2`. Verification remains `focused-local / CI-final-pending`, high-assurance. The owner approved full/partial/no salary offset and independent later repayment, then authorized their implementation. Storage, command and offset scopes have completed their required local reviews and source-matched proof.

The internal read-only lifecycle and nonblocking opening review seam below implement existing #558/#427 acceptance without new storage, public contracts or production activation. They may proceed under the current issue authority. The proposed public RPC and UI contract remains for owner approval before those public interfaces change. Do not infer that implementing a reader authorizes its public registration or changes the normal database.

## Internal bounded lifecycle reader

Expose one source-scoped `getEmployeePayroll(employeeId)` internal reader over a caller-supplied exact finance service, native connection and FIFO. Do not create a private finance instance or shadow ledger. Validate the same transaction identity for the optional opening provider before reading. Use the real current earning adapter, source lookup, cash/repayment and offset adapters. A nonexistent employee is an error, not an empty zero balance.

Count the combined selected rows before materialization: employee earnings and their segments, cash headers and wage allocations/advances, cash repayment records, offset records, and relevant employee debt accounts/entries used by finance remaining calculations. A combined maximum of 10,000 fails closed, never returns a prefix. The optional opening provider supplies a bounded count before hydration, and those rows join the same budget. Count all entries in the selected worker accounts that finance.detail may load, including unrelated producer entries. Do not hide an unbounded account hydrate behind a small payroll-source count.

Cache finance detail once per relevant account and map original remainders. Do not call an account-wide remaining calculation for every source. Current earning/source lookups remain keyed and capped, with duplicate original rejection. Only after the combined budget passes may the reader materialize earnings and event history.

Return current earnings and allocations, actual cash events, cash repayments, explicit noncash offsets and separate advances, with exact summaries. Keep approved earnings, wage cash paid, wages settled by offset, current wages owed, advances given, cash recovered, advances settled by offset and advances owed distinct. Unallocated earnings remain a project-attribution value, not a payment balance. Reference salary never enters the arithmetic.

The existing earning record is authoritative even before a prepared exact ledger original is registered. Show an unposted earning as fully outstanding with explicit pending-registration metadata; a read must not create a debt or infer a historical payment. For linked originals, validate ledger remaining against approved amount and recorded source movements. For advances, validate ledger remaining against explicit source amount, cash recoveries and offsets. Refuse unattributed or inconsistent movements instead of presenting a false balance. Use wide exact report sums for cross-record totals; persist nothing and never use JavaScript Number for money.

The implementation keeps `getEmployeePayroll` synchronous and opens one read transaction through the cash adapter. The reader constructs the existing earning adapter with the supplied database and FIFO, then checks connection and lock identity for finance, source, cash, offset and optional opening adapters. It counts earning segments, cash headers and children, repayments, offsets, worker debt accounts and every entry in those accounts before loading collections. Opening provider cost joins that count; returned review/source rows must match the reported cost. Finance details are cached by account.

Cash, repayments and offsets remain separate records. The summary uses `sumMoneyHistory`; pending earning originals report the approved amount as owed without registration. Every posted original must match its source amount, remaining balance and exact attributable ledger movements. A cash earning source must point to an earning selected for that employee. Opening `wages` and `advances` are remaining balances after validated events; they are null without a review and exact zero only for a reviewed empty collection. Current-app summary totals exclude opening balances and state when an unreviewed opening is unknown.

Native plain and keyed proof passed for the new reader and existing payroll service, cash adapter and offset adapter: 148 tests across four files. The lifecycle file covers pending reads with unchanged ledger row counts, the 35,000 / 25,000 / 10,000 wage balance, independent cash recovery and offsets, opening review and source linkage, wide report sums, combined budget refusal, source drift, employee absence and transaction identity. A separate test provider exercises the opening seam only; it is not the #545 provider delivery. Full local suites, builds and public RPC/UI remain out of scope.

## Opening review seam

Missing provider means UNREVIEWED, reminder true and unknown opening wage/advance amounts, not zero. Paying current approved earnings does not change that state or clear the reminder. Ordinary cash and offset command execution must not depend on fetching review status. The initial reader can expose current-app balances while clearly marking that unknown openings are not included.

Define a narrow optional same-connection/FIFO provider for review status and reviewed source metadata. It supplies bounded row cost, review state and exact wage/advance originals owned by PAYROLL_OPENING. REVIEWED with no sources is explicit confirmed zero; never derive that state from absence. Reviewed sources must match worker, currency, producer, direction, original status and exact source amounts before inclusion. No opening entry/correction tables or writers are introduced. This is a stable read integration point for #545, not delivery of #545 or permission to use reserved opening kinds in current offset commands.

## Proposed public contract, pending owner approval

Use additive top-level workforce procedures, matching the current normal employee API rather than restoring the preserved alternate workforce namespace. Keep existing employee earning identities and legacy history. Do not reopen the refused numeric salaryPaymentsCreate writer.

- `employeePayrollGet`, input employeeId, returns the complete bounded lifecycle above. Summary report strings may exceed one stored Money bound; individual record amounts remain bounded Money2.
- `employeePayrollCashRecord`, input requestId, employeeId, exact amount, paymentDate, ordered wages with earningId and exact amount, optional advanceAmount. Returns immutable cash provenance. Extra earned bonus must already be approved through the current earning flow; the payment does not invent a bonus.
- `employeePayrollAdvanceRepay`, input requestId, employeeId, advanceId, exact amount and paymentDate. Returns independent cash repayment provenance.
- `employeePayrollAdvanceOffset`, input requestId, employeeId, explicit wageSource/advanceSource, exact amount and settlementDate. Returns paired noncash offset provenance. Current supported sources are EARNING and ADVANCE; opening kinds fail closed until integrated.

All amounts cross JSON as exact strings. Audit identity and transaction metadata come only from the authenticated server context and are forbidden in client payloads. Retain the existing bootstrap-owner financial wrappers used by legacy salary payment and finance procedures. Do not create roles, add permission grants or let employee-profile editing alone grant financial writes. Explicitly test anonymous, nonowner and forged audit input refusal, then real authenticated persistence/retry/rollback/reopen through the configured prepared composition.

The UI proposal adds an optional Record payment action from current approved earning history, a payment-record drill-down and short separate wage/advance balances. Offer explicit full/partial/no recovery choice; independent repayment remains a separate action. Preserve current production routes/forms, RTL, keyboard controls, pending intent across uncertain responses/reload and currency beside values. Show the unreviewed reminder without blocking current payment. UI acceptance needs actual rendering and owner inspection later; this note does not grant final visual approval.

## Proof and completion

Internal reader proof uses native plain/keyed current earning/finance/cash/offset sources. Cover no-payment approvals, unposted earnings, 35,000/25,000/10,000, advance/offset/repayment, unchanged allocation semantics, no automatic netting, no implicit opening zero, reminder after first cash, explicit reviewed zero and real provider linkage, wide report totals, combined pre-hydration refusal, source/ledger mismatch, foreign connection/FIFO and no reads that mutate data. Preserve exact-source logs and native exits; affected tests/types/lint only.

The public contract, authenticated normal UI and final normal-app acceptance require owner approval of the proposed interface and coordinated exact-debt root composition. No production schema conversion, migration/reset, real-data cutover, publication, merge or release is authorized here. Full #558 acceptance and hosted gates remain open. Record implementation proof separately from those decisions.
