# #558 payroll command foundation

## Scope and authority

Start from reviewed storage HEAD `03083f42567adae3802c7fd0a1e710d3a2500a0c` in `D:/worktrees/tuari_react_hono/t3-48d661ef-3ae352d3d2c079c6`. Verification mode remains `focused-local / CI-final-pending`. Tier is high-assurance because these commands settle money and own duplicate-submit protection.

The owner instructed this thread to reuse #427's approved design unless a concrete improvement is justified. The earlier design approved one debt ledger, explicit wage approval, cash source headers and allocations, explicit recoverable advances and attributable recovery. The storage slice now has three initial reviews plus one clean combined-delta review. Its source and evidence remain preserved.

This slice adds internal command coordination and read-only source resolution in an isolated prepared exact-schema composition. `PayrollService` coordinates earning registration, explicitly allocated cash, optional explicit advance cash, and selected advance cash repayment. `PayrollSourceRepository` resolves one current earning or selected advance at a time; its SQLite adapter asserts finance's connection and FIFO. The targeted cash adapter lookup resolves an advance by its stored ID without materializing an employee-wide collection. No opening provider is wired, so opening sources cannot be selected by these commands. It changes no production startup, normal approval writer, public RPC contract, database marker activation, UI or existing earning/project segment identity. It is not application acceptance or permission for normal-app activation.

## Existing identities and liability linkage

Use current `employee_earning` records and their `currencyCode` and exact `totalAmount`. Do not copy the preserved alternate `employee_salary_earning` model. A narrow read-only source adapter may query the current earning ID, employee ID, currency and total using exact native reads; it must share the physical connection and FIFO with finance and cash. It does not own approval writes or a replacement earning amount.

Use existing finance `producer_type=PAYROLL_EARNINGS` and `producer_id=earning.id` as the earning-to-original attribution. Resolve at most two original rows so a duplicate producer original fails closed rather than silently choosing one. This needs no new link table, amount cache or modification of the shipped earning schema. A positive immutable approval has one linked positive worker PAYABLE original. A zero approval creates no zero obligation. A registration operation must validate the actual earning, employee and currency under the aggregate transaction, preserve any valid existing original and reject inconsistent or voided linkage. It must not infer wages from salary reference or old payments.

Registration is an explicit internal capability for later approval/composition integration. The payment command may call it for explicitly selected existing approvals within its own aggregate transaction. Unselected approvals are not backfilled by reading cash history. Normal approval registration and whole-employee liability completeness still require the later owner-approved production composition.

## Command behavior

The payroll module exposes a small internal interface for registering a selected approved earning, recording cash and repaying a selected advance. Inputs use stable request IDs, exact decimal strings, real employee/source IDs and an operator payment timestamp. Server audit metadata remains separate from domain input. Normalize timestamps and money before fingerprinting and use existing exact finance aggregate receipts, not another replay store.

A cash command validates all selected sources and reconciles its exact total to explicit wage allocations plus an optional advance. It registers or validates current earning originals, records producer-scoped target payments and saves the one immutable cash event in one synchronous immediate aggregate transaction. An allocation cannot exceed its own original's remaining balance. Cash above selected wages without an explicit advance fails before partial records can escape. An earned bonus is separately approved through the current earning flow before payment; no cash command invents earnings, bonus allocations or project labor cost.

An advance uses a worker RECEIVABLE original owned by PAYROLL_ADVANCE and its explicit ID. Repayment selects that source, validates its parent cash/worker/currency and original linkage, records a producer-scoped payment and saves repayment provenance atomically. Wages and advances never silently net. This command is cash recovery only. The approved explicit advance-against-wages offset behavior still needs its paired wage/advance provenance contract and is not represented as cash repayment.

Keep integration points for an optional opening-source provider and its review/reminder state. Without a provider, opening targets fail closed; review status remains UNREVIEWED with a nonblocking reminder rather than confirmed zero. A real provider must share transaction identity and supply reviewed sources linked to the authoritative finance entries. No opening entry, review writer or correction feature ships here.

## Transaction and read rules

Finance, cash and source resolution use the same native connection and FIFO. Reject a foreign connection or lock before any command writes. `ExactFinanceService.runAggregate` owns the receipt and transaction. The same canonical intent and actor replays the prior result; changed intent or actor conflicts. Failure of any linked payment, source row or receipt rolls back every aggregate effect. Different requests against one earning see current remaining amounts under the write reservation.

Do not introduce an unbounded lifecycle method by concatenating individually capped lists. Keep the new read interface source-scoped and finite. The future whole-employee lifecycle reader must budget earnings, segments, cash, repayments and opening sources together before hydration. A source lookup returns only the selected earning or advance; duplicate original lookup is capped at two rows.

## Proof and completion

Prove the internal command with real current earning tables and the actual exact finance/cash adapters on native plain/keyed prepared files. Required focused cases are approval with no cash, reference 30,000 versus approval 35,000 and cash 25,000 leaving 10,000, partial/repeated/full payments, explicit 5,000 advance on 40,000 cash, explicit repayment, wrong employee/direction/currency/source, malformed money, canonical offset-time retry, changed actor/intent conflict, foreign transaction identity, injected source/receipt rollback and write/close/reopen. Assert approved segments and their independent project-cost amounts remain unchanged by every cash command. Existing earning provenance and storage tests remain valid.

Focused proof uses the repository's actual `employee_earning` DDL and current earning rows with the real exact finance and cash adapters. It verifies approved 35,000 against a 25,000 cash payment, leaving 10,000; registration replay; rejection of an unapproved 40,000 wage allocation; and an explicit 5,000 advance with a separate 2,000 repayment, leaving 3,000 receivable. The test set does not yet cover malformed, mislinked, duplicate or voided sources; canonical timestamp retries; changed actor or intent conflicts; rollback across injected persistence failures; or close/reopen command replay. Parent review should treat these as remaining proof, not passed criteria.

Stage named source/tests and this design only, preserve failed logs and exact SHA evidence under ignored `.scratch/reviews/558-orchestration/`. Use focused tests, relevant lint/typecheck and justified contracts prerequisites, not full suites or builds. Parent owns the required initial lenses, bounded corrections, architecture check and Guard readiness. No child pushes, opens a PR, merges, changes production storage or claims #558 complete.
