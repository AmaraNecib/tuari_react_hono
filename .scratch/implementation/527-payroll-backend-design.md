# Payroll backend lifecycle handoff

Base: `c626775b9f1ca681e84f334552f876b7b0f85de6`, descended directly from the supplied revision. Worktree: `D:/worktrees/tuari_react_hono/t3-5bdd9783-258ffcb60136f7f7`, branch `feat/payroll-lifecycle-backend`. Verification mode: focused-local / CI-final-enforced. High-assurance. The parent owns current-head CI and effective protection checks. This is a backend slice of #427/#527, not final application acceptance.

## Domain and interface

Payroll sources describe explicit events. `employee_salary_cash` records actual amount, date and audit only. `employee_salary_payment_allocation` links each wage portion to an earning or reviewed opening obligation and its finance payment entry. `employee_salary_advance` records only the explicit recoverable portion. Finance remains the authority for balances, remaining amounts, receipts and ledger history. The cash source is never an extra earning or a second payment.

`PayrollCashService` now owns cash, opening review, advance repayment, positive-original earning correction and employee lifecycle reads. Its commands enlist the cash/source repository in `ExactFinanceService.runAggregate`; source, finance entries and the one existing aggregate receipt share the same connection, FIFO and immediate transaction. `createExactWorkforceComposition` requires and returns the caller's exact finance instance and exposes `services.workforce` plus `services.payroll`. No internal finance fallback was added.

The existing `exactWorkforceContract` retains `approveMonthlyEarnings`, `listEmployeeEarnings` and `getProjectSalaryCost`. Added procedures are `recordPayrollCash`, `reviewPayrollOpening`, `repayPayrollAdvance`, `correctPayrollEarning` and `getEmployeePayrollLifecycle`. The lifecycle DTO contains `opening`, `earnings` with finance-backed `remainingAmount`, `cash`, explicit `advances`, `settlements` and `corrections`. The DTO schemas enforce canonical money strings, explicit cash target reconciliation, bounded lists, and strict object shapes. The authenticated RPC handlers use existing mutation audit middleware; caller audit fields are not accepted.

Opening review distinguishes `UNREVIEWED` from reviewed zero. Opening originals use `ADJUSTMENT`, since review can follow account activity. Cash dates stay on cash and settlement source records; finance keeps its own posting clock. Corrections append `previousAmount`, `newAmount`, reason, audit and a linked producer-owned correction entry. Positive decreases are allowed while the new amount remains at least the amount already paid. A correction below the paid amount returns `CONFLICT` before writes; the owner must decide whether to record a receivable, refund or another treatment. No such treatment is inferred. Zero replacement, reversal, writeoff and automatic netting remain unsupported.

## Schema and preservation

`exact-workforce-schema.ts` owns fresh payroll DDL for corrections alongside the already-present opening, cash, allocation, advance and settlement tables. Every source table has update/delete guards and collision guards against `INSERT OR REPLACE`; tests disable recursive triggers. The exact employee deletion guard now detects actual cash directly and finds advances/allocations through their cash parent, rather than querying nonexistent `employee_id` columns. Legacy `employee_salary_payment` remains unchanged and is not read as a cash source.

The correction table links to the approved earning and finance correction entry. Readback cross-checks cash allocations, their original and payment entries, advances, settlements and correction entries against the finance ledger before returning lifecycle data. Reads and writes stay within the existing bounded materialization limits.

No startup, root mount, AppContract, UI, migration, finance implementation, generic gate, debt/invoice/inventory code or dependency changed. Root still owns the later normal mount at `/rpc/workforceExact`; no alternate host or employee namespace was added.

## Proof plan and results

Focused native tests use actual plain and keyed database factory drivers, the real `ExactFinanceService`, source adapters and the actual authenticated router. They cover $35,000 approved / $25,000 paid / $10,000 remaining with project cost unchanged; $40,000 cash requiring an explicit $5,000 advance; partial/full advance repayment; opening reminder and reviewed zero/nonzero; cash date distinct from ledger posting time; correction replay and paid-amount refusal without writes; employee/account/currency/producer identity; aggregate rollback; malformed physical amount type; and immutable update/delete/replace behavior with recursive triggers disabled.

Focused contract tests validate actual lifecycle DTO shape and reject malformed cash outputs. Existing cash native cases retain fixture corrections for real project/debt dependencies and keyed on-disk databases. Earlier missing-module and fixture-shape failures are setup reds, not behavioral regressions. No log is treated as a behavioral red unless its assertion reached the claimed contract.

Current local commands, exact SHA, native exit codes, counts, durations and raw log paths are recorded in `.scratch/reviews/527/child-backend-2026-11-12/verification.md` after commit. Full suites, root integration, browser/UI, current-head CI, effective protection, review lenses and owner acceptance remain parent gates. No application acceptance or issue completion is claimed.

## Lessons

Applied: acquire `BEGIN IMMEDIATE` under the injected FIFO before transactional reads/writes; use actual keyed factory drivers rather than key-setting mocks; typecheck schema-shaped test fixtures because Vitest transpilation does not typecheck; keep RPC procedures tied to real handlers rather than stubs. Excluded: whole-root application activation, legacy compatibility behavior and any project-cost reallocation rule for correction deltas. No repeated wisdom candidate identified.
