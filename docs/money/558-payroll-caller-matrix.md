# #558 isolated payroll monetary fields

These fields belong to prepared exact-schema capability only. They are not imported by normal startup and do not change the initialized monetary inventory described in the #523/#543 matrix. The owner approved the paired wage/advance offset provenance after confirming full, partial, no-offset and independent cash repayment behavior.

| Field | Storage | Classification and authority |
| --- | --- | --- |
| employee_salary_cash.amount_minor | INTEGER | F, positive Money2 actual cash amount. Payroll command owns reconciliation; cash repository owns immutable persistence. |
| employee_salary_payment_allocation.amount_minor | INTEGER | F, positive Money2 portion of actual cash attributed to an original and PAYMENT entry. Not a current balance. |
| employee_salary_advance.amount_minor | INTEGER | F, positive Money2 explicit recoverable cash portion linked to its RECEIVABLE original. Not labor cost. |
| employee_salary_settlement.amount_minor | INTEGER | F, positive Money2 actual cash repayment against a selected advance original and PAYMENT entry. |
| employee_salary_advance_offset.amount_minor | INTEGER | F, positive Money2 noncash paired reduction of selected wage and advance originals. Links two SETTLEMENT entries with null payment method. |

Every amount uses the accepted exact decimal-string wire form, checked reversal-safe int64 native minor units and DZD inherited from both selected account owners. Storage rejects zero, negatives, REAL amounts, unsupported currency, overflow and mismatched attribution. Source dates, IDs, ordinal values, audit metadata and reference kinds are not monetary fields. No record stores a current owed balance, project cost or copied salary reference.

## Writers and readers

`PayrollService` owns explicit registration, cash, cash repayment and wage/advance offset intent and transaction coordination. `ExactFinanceService` remains the only ledger writer and owns balances and durable receipts. Its internal producer-scoped `recordSettlement` targets a single positive original, can settle only part of the remainder and emits SETTLEMENT with no cash method. It is not added to generic debt RPC. Cash/repayment continue to use PAYMENT and an actual cash source.

`SqlitePayrollCashRepository` persists and reads the first four fields. `SqlitePayrollOffsetRepository` persists and reads the fifth. Both attest owned physical schema definitions, use the same native connection/FIFO, bind exact Money and perform statement-local exact reads. Shared SQL predicates validate direction, employee, currency, original and linked movement provenance during insert and hydration. Offset/cash/repayment collection guards prevent cross-attribution. Physical update/delete/replace guards retain history.

`SqlitePayrollSourceRepository` reads current `employee_earning` totals and existing advance source identities. It creates no alternate earning or balance store. Existing earning and project-cost adapters remain authoritative for approved segments and cost; cash, repayments and offsets never rewrite those rows. Future lifecycle readers must distinguish paid cash from noncash settlement when calculating display totals.

## Coverage boundary

Native plain/keyed tests check this closed set of five physical amount fields and INTEGER types. Behavioral cases cover literal exact amounts, large cents, source linkage, partial/full/no offset, independent repayment, duplicate attribution, immutable history, canonical replay, paired rollback and reopening. The contracts inventory registers the new isolated consumers without weakening its initialized-field inventory or enabling production imports.

No public RPC/UI, opening source provider, whole-employee lifecycle, production schema conversion, activation, backup/restore or release acceptance is claimed by this matrix. Adding the offset table requires no change to configured application databases; preparation remains opt-in. Correction/reversal writers remain outside the initial offset implementation and cannot erase one leg silently.
