# Exact SYSTEM LOG compatibility reader

## Scope and state

Base c428d3abb48c86c7e18c206eaada40990900221c.
Worktree D:/worktrees/tuari_react_hono/t3-c81b59b6-b04ff65a54220b20.
Verification mode focused-local / CI-final-pending. High assurance because a
rounded amount or invented attribution would misstate a durable financial posting.
This worker implements and commits locally. Parent owns reviews, mounting and publication.
No default activation, schema, router, contract, writer or dependency change.

## Interface and domain vocabulary

The parent constructs createExactSystemLogReader(db, sharedFifo) after
ensureFreshExactApplicationSchema. listSystemLog(filters) returns the existing
{ items } shape. listSystemLogPage(filters, { offset, limit }) adds a local
group-aware window with totalCount. The existing public contract has no server
paging fields; the web currently pages the complete items array. No contract
change is needed. Existing CSV consumers receive the same string-valued entry
fields and multiline detail convention.

A posting is one durable debt_entry, including a correction posting. Cash is
employee_salary_cash, not reference salary, approved earnings or a command receipt.
Settlement is a SETTLEMENT posting, including payroll offset postings.
An account has no separate emitted creation event in the legacy builder,
despite DEBT_ACCOUNT_CREATED being a permitted enum member.

The new module hides bounded SQL projection, metadata aggregation, attribution,
filtering and grouping behind one purpose-shaped reader. Deleting it would return
these responsibilities to the composition root. The metadata read interface is
a Pick of actual CompanyRepository methods, not a second universal audit store.

## Actual emitted families and sources

| Existing family | Read authority | Compatibility policy |
| --- | --- | --- |
| EMPLOYEE_CREATED / EMPLOYEE_UPDATED | employee_state_history, current employee and role lookup | Existing state-history summary/status semantics. |
| WORKPLACE_ASSIGNED | employee_manager_assignment, employee_project_assignment, employee_warehouse_assignment | Existing current row status/notes and current employee/place labels. |
| PROJECT_MANAGER_CHANGED / WAREHOUSE_MANAGER_CHANGED | project_manager_ownership_history, warehouse_manager_ownership_history | Existing history and current manager/place label semantics. |
| ACCOUNT_UPDATED | user_profile_history | Recorded previous/name/phone/password-change fields only. |
| INVENTORY_ITEM_CREATED | inventory_item_definition | Existing current catalog row and its created_at, not purchase/movement events. |
| DEBT_ENTRY_RECORDED / DEBT_SETTLED | exact debt_entry, debt_account party identity, current party label lookup | Exact signed_amount_minor, recorded actor/transaction, entry_date. Include voided postings with explicit VOIDED detail. |
| SALARY_PAYMENT_RECORDED | employee_salary_cash | Exact amount_minor, recorded actor/transaction, payment_date. No employee_salary_payment query. |

SqliteCompanyRepository writes organizational history in create/update employee,
assignment and manager-ownership methods. Profile history retains explicit previous
fields; catalog has current-row provenance, not a version ledger.
ExactFinanceService.append records signed amount, entry date, transaction and actor.
correctEntry appends an ADJUSTMENT delta. settleAccount and producer
recordSettlement append SETTLEMENT postings. voidEntry marks original and related
postings VOIDED; it does not create a separately attributable event.
PayrollService.recordCash and SqlitePayrollCashRepository.saveCash persist actual
cash headers. repayAdvance and offsetAdvance create debt postings; they do not
create another salary cash event.

No fabricated balance-after detail: ExactFinanceService.recompute rewrites
balance_after_minor and updated_at after void. They cannot prove a historical
balance or original event time. Posting date and immutable signed amount remain
honest. No new void action type or invented receipt event is introduced.
Unknown recorded actor labels stay null; present-day convenience labels remain
in actorCurrentLabel. Legacy default actor fallback remains unchanged.

## Consistency and limits

One shared FIFO runSync guard encloses one deferred SQLite read transaction.
Foreign FIFO holders fail before any SQL; existing open transactions are refused.
Every materialized table is counted through a bounded LIMIT query before reading
any result rows. The shared total cap is 100000 rows, including metadata/label
lookup tables. A smaller test/operator cap may be supplied, never a larger one.
Overflow refuses even a selective filter instead of returning a partial history.
Money uses statement-local safe integer decoding through prepareMoneyRead.
No Number conversion, global safeIntegers switch, source mutation or immediate
write reservation is needed.

Grouping/filtering is shared with the legacy builder. Debt events stay independent.
Other events group by recorded transaction ID. Matching events select the primary;
unmatched siblings remain in group detail. Paging follows grouping/filtering.
New-reader ties preserve legacy family precedence, with IDs as deterministic ties
within each family. Legacy ordering is unchanged.

## Proof and boundaries

Native fresh application fixtures run both plain SQLite and keyed cipher storage.
They exercise the actual selected financial graph, earnings repository and cash
writer, large cents, both debt directions, correction/settlement/void, offset and
repayment, organizational grouping, catalog/profile compatibility, dates, paging,
unknown actors and foreign FIFO refusal. A query-only connection and unchanged
total_changes demonstrate that reading performs no writes. Existing legacy
system-log tests remain unchanged and run with the refactor.

Local evidence and preserved failures are under .scratch/reviews/558-systemlog.
No independent reviewer ran in this child. Parent must run the three required
lenses on the committed source-owning tree, then own selected-system mounting.
This reader alone does not establish issue 558 readiness or CI-final acceptance.

Applied wisdom: deterministic gated FIFO proof; API timestamp bounds stay instants,
while client date-range builders own inclusive local end-of-day expansion.
Architecture review remains parent-owned and scoped to this read interface.

## Bounded review correction

Correction base 4471fd8123b93393380ea438a0174d06033aa499.
The initial debate and code-review reports found no actionable implementation
defect. The parent accepted a stronger discriminating test for tied profile/catalog
ordering and paging, not a claimed current defect. The older metadata parity test
already inserts both families together; the new scenario adds explicit independent
order assertions and a page boundary containing a two-row profile transaction group.

Source inspection and native execution establish profile-before-catalog at an
equal timestamp. The legacy builder emits user_profile_history before catalog
definitions, and the current reader rank agrees. Review wording that claimed
catalog-before-profile does not match this source. No production change is needed.

The new scenario runs in both existing plain/keyed native modes, uses equal
created_at and updated_at values at insertion, compares full unfiltered output to
the compatible legacy projection, and checks one-item pages on both sides of the
profile/catalog group boundary. Two profile rows must remain together.

Negative proof temporarily swaps only these two reader family ranks. The new
order assertion fails in both native modes, while the legacy expectation remains
unchanged. The mutation is restored before affected tests, typecheck and lint.
This is mutation discrimination, not evidence of an original implementation bug.
Raw results and source fingerprints live under
.scratch/reviews/558-systemlog-tie. Only this test and design note are committed.
The parent owns one fresh combined-delta review that carries forward unchanged
initial conclusions. Default mounting and CI-final acceptance remain pending.
