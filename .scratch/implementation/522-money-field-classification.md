# Issue 522 monetary-field classification

Status: complete inventory coverage and DAILY input choice recorded for the
final council's second pass. This asset resolves the missing field map and ties
salary precision to the owner's operational answer. Do not activate conversion.

## Source and method

Application source `17d6277bee359a059d0af5d5befaa887446fae9b` in research head
`4f1c73d3b8c4edaad420d146dfc93c58392d666b`, read from
`D:/worktrees/tuari_react_hono/research-issue-521-inde-eddf359697e3e0d0`.

Extracted the REAL columns of every CREATE TABLE in the actual initializer's
`apps/api/src/infrastructure/database/schema-definitions.ts`, excluding quantity,
not repeated ALTER statements or declarations alone. This yields exactly 27
columns in 17 tables. Read concrete writer/reader paths below to classify
meaning, not SQL affinity or the word price. This is a semantic design audit,
not an exhaustive implementation conversion of every caller.

Classes:

- F: finalized/agreed monetary amount or a snapshot/balance thereof; two DZD
  places, checked symmetric int64 minor units, existing sign/zero/null rules.
- P: explicitly entered unit price; four places, separately scaled integer.
- R: derived rate; exact original numerator/denominator, no forced finite scale
  and no independently writable approximate price.
- I: exact line intermediate; preserve source-mode/operands, no per-line cent
  rounding before document finalization. An explicitly entered agreed line
  total is F in total-authoritative mode; assets can sum individual F values.
- S: entered salary reference plus period. MONTHLY and legacy WEEKLY are agreed
  period amounts at two places. DAILY is a price per whole working day, normally
  entered as a whole DZD value; the owner chose up to four places if fractional
  input is allowed (option 2). Permit it without requiring decimal entry/display
  or introducing a new preference. Preserve period and scale together.

## Complete physical inventory

| # | Table.column | Class and proposed financial boundary | Actual paths |
| --- | --- | --- | --- |
| 1 | employee.salary_amount_dzd | S, nullable; DAILY up to four places, MONTHLY/WEEKLY two; reference is not an earning or payment | W1/W2/R1 |
| 2 | employee_state_history.salary_amount_dzd | S snapshot, same scale/period as original reference, not recalculated from today's employee | W1/W2/R1 |
| 3 | employee_salary_payment.expected_amount_dzd | F computed proposal, finalize after source-reference arithmetic; never round a monthly daily quotient first | W1/W2/R1/R2 |
| 4 | employee_salary_payment.actual_amount_dzd | F actual agreed payment; input over two places rejected; original for conserved project allocations | W1/W2/R1/R2 |
| 5 | debt_account.current_balance | F signed resulting balance; check same transaction as entry | W3/W2/R1 |
| 6 | debt_entry.signed_amount | F signed posting, direction/account/currency rules separate | W3/W2/R1 |
| 7 | debt_entry.balance_after | F signed running snapshot; recomputation uses exact live postings | W3/W2/R1 |
| 8 | inventory_invoice_group.gross_total_dzd | F document finalization after exact I sums, not sum of separately rounded I values | W4/W5/R3 |
| 9 | inventory_invoice_group.paid_amount_dzd | F entered or computed payment target; percentage stays a separate quantity, computed target finalized once | W4/W5/R3 |
| 10 | inventory_invoice_group.remaining_debt_dzd | F exact difference of finalized gross and paid; same value reaches debt ledger | W4/W5/R3/W3 |
| 11 | inventory_entry.unit_price_dzd | P for entered consumable price; R for asset-group mean and future total-authoritative mode; nullable semantics retained | W4/W5/R3/R2 |
| 12 | inventory_entry.total_price_dzd | I for consumable product; F source for an explicitly agreed line/group total; exact sum of per-asset F prices for assets | W4/W5/R3 |
| 13 | inventory_asset_unit.purchase_price_dzd | F explicitly agreed price for this identified asset; not an average or rental-per-day rate | W4/W5/R3/R2/W6 |
| 14 | inventory_asset_charge.amount_dzd | F charge for a placement, including explicit override/default; no duration multiplier in this writer | W6/W7/R2 |
| 15 | inventory_asset_charge_revision.previous_amount_dzd | F previous placement-charge snapshot | W6/W7 |
| 16 | inventory_asset_charge_revision.new_amount_dzd | F replacement placement charge; nullable for void record | W6/W7 |
| 17 | inventory_outbound_transfer_item.unit_price_dzd | P optional explicitly supplied transfer valuation price; if a default originates in R, retain its source rather than round-trip an approximate display | W4/W5/R3 |
| 18 | invoice.total_amount | F document total after exact line I sum | W8/W9 |
| 19 | invoice.paid_amount | F sum of recorded final allocations/payments | W8/W9/W10 |
| 20 | invoice.remaining_amount | F exact difference of finalized invoice and payments; no line repricing | W8/W9/W10 |
| 21 | invoice_line_item.unit_price | P entered price; R when an explicitly agreed total is authoritative, requiring source-mode metadata | W8/W9 |
| 22 | invoice_line_item.total | I computed product or F agreed-total source, not an independently writable competing total | W8/W9 |
| 23 | payment.total_amount | F positive final payment; equality against exact allocation sum | W10/W11 |
| 24 | payment_allocation.amount | F positive final portion of a payment; bounds against invoice remaining amount | W10/W11/W9 |
| 25 | expense.amount_dzd | F positive final expense, independent of stock movement | W12/W13/R2 |
| 26 | expense_revision.previous_amount_dzd | F previous expense snapshot, nullable where schema allows | W12/W13 |
| 27 | expense_revision.new_amount_dzd | F replacement expense snapshot, not a percentage or rate | W12/W13 |

Coverage: 20 F columns, two S columns, three P/R-capable price columns, two I/F
line-total columns. Every physical column has a semantic classification. S has
explicit period-tagged scales, not an unresolved catch-all. Salary snapshots
retain the original period/scale; a period-only edit must not reinterpret an
integer coefficient or change the intended DZD reference.

## Concrete writer and reader anchors

Paths relative to the pinned source tree:

| ID | Source and observations |
| --- | --- |
| W1 | `apps/api/src/modules/company/workforce.service.ts:155-184,461-492,619-720`: pairs salaryAmountDzd with salaryPeriod; creates proposed and actual final payment amounts. |
| W2 | `apps/api/src/modules/company/adapters/sqlite-company.repository.ts:379-421,578-632,886-912`: employee/history inserts and updates, debt postings/balances, expected/actual salary payment persistence and period snapshots. |
| W3 | `apps/api/src/modules/company/finance.service.ts:379-428,459-492,548-608`: signed entry plus resulting balance, void/recomputed snapshots and settlement; `adapters/sqlite-finance.repository.ts:27-29` delegates to W2. |
| W4 | `apps/api/src/modules/inventory/inventory.service.ts:425-545,610-680,1179-1181,1299`: consumable price times quantity, asset-by-asset prices and derived average, document/payment calculation, optional outbound entered price. |
| W5 | `apps/api/src/modules/inventory/adapters/sqlite-inventory.repository.ts:99,156-157,565-584,913-914,949-1010`: actual persistence and projections; asset purchase price can substitute for material unit price in reports. |
| W6 | `apps/api/src/modules/inventory/asset-charge.service.ts:81-125,180-217,276-293,336-337`: placement default from prior charge or asset purchase price; overrides, amount revisions and voids; no other entered time-based rental rate. |
| W7 | `apps/api/src/modules/inventory/adapters/sqlite-asset-charge.repository.ts:34-48,81,137-145,172,248-249`: charge and revision persistence/readback. |
| W8 | `apps/api/src/modules/invoice/invoice.module.ts:24-26,88-115,127-150`: exact-intent source is line price times quantity, summed invoice total; draft update recomputes. |
| W9 | `apps/api/src/modules/invoice/adapters/invoice.repository.ts:43-63` plus create/update methods: numeric invoice/line mappers, line persistence and payment status updates. |
| W10 | `apps/api/src/modules/payment/payment.module.ts:69-155`: final allocation sum equality and invoice capacity, positive payment/allocation records and debt-linked invoice balance updates. |
| W11 | `apps/api/src/modules/payment/adapters/payment.repository.ts`: actual raw INSERTs use total_amount and amount, not the mismatched Drizzle amount_dzd declarations; mapRowToPayment/mapRowToAllocation around 240-270 and money sorting/cursor serialization are conversion paths. |
| W12 | `apps/api/src/modules/expenses/expenses.module.ts`: validates agreed expense amount and records revisions/voiding; a final expense is not a unit rate. |
| W13 | `apps/api/src/modules/expenses/adapters/sqlite-expenses.repository.ts:50-87,121-150,192,260-288`: actual amount and old/new revision writes/mappers. |
| R1 | `apps/api/src/modules/company/company.repository-mappers.ts:60,152,206,238,254-257` and W2 mapEmployee/mapHistory/mapPayment/mapDebt: reference, payment and ledger read types currently use numbers. |
| R2 | `apps/api/src/modules/project-cost/adapters/sqlite-project-cost.repository.ts:50-173` and `project-cost.service.ts:58-75,134-156`: reads expense/payment/charge/asset prices; derives salary day rate from recorded actual payment/days, and material movement value from quantity/source unit price. |
| R3 | `apps/api/src/modules/inventory/inventory.service.ts:1375-1548` and W5: report values from exact entry products or outbound quantity times quoted valuation price, not all already-finalized invoice amounts. |

These anchors identify checked paths, not a claim that no additional export,
UI, history, background or direct-SQL caller exists. The conversion issues must
still search all callers and test the real initialized schema.

## Derived/non-column values and storage consequences

The asset-group average is already computed as total asset price divided by
asset count (`inventory.service.ts:659-670`). It is R, not an entered four-place
price. The same applies to a price derived from an agreed total and quantity.
Do not migrate these as if all unit_price_dzd values were independently entered
four-place quotes. Mark source mode and retain original operands; use those
for subsequent valuations instead of a rounded display value.

An I value can exceed int64 at its product scale even when the final cents fit.
The physical transition must keep typed source operands and compute the logical
I value, or provide an exact derived-value encoding that is not an independently
writable money ledger. It must not blindly convert these two line-total columns
to int64 cents. Generic invoice quantity constraints are distinct from inventory's
six-place quantum; preserve supported source quantity semantics and exact finite
coefficients, rather than imposing a new quantity scale via a money migration.

Salary project-report dayRateDzd is R from actual payment divided by recorded
days, not a new entered daily wage. Its project shares use the approved conserved
allocation, not independent per-row rounding. Monthly reference divided by 30 is
also R. The legacy WEEKLY branch returns the raw period reference and is not
exposed for new UI selection; this audit does not authorize changing that policy.

Payment percentages remain a separate percentage type. They produce a final F
payment target using exact operands and the approved currency finalization rule.
Project/inventory material report products are I/derived valuations, not evidence
that a posted invoice should be recalculated from unrounded historical values.
Current placement charges are final placement events, not daily rental rates.
No additional entered rental, interest, commission or exchange-rate column was
found among these 27 initialized fields.

## Resolved daily-wage input decision

`employee.salary_amount_dzd` and its history mirror can represent DAILY as well
as MONTHLY and legacy WEEKLY. Current `computeProposedSalaryAmount` in
`packages/contracts/src/salary-days.ts:103-123` first rounds the entered reference
to cents before DAILY multiplication; the input contract itself accepts any
nonnegative number and `normalizeSalaryAmount` does not enforce two places.
Therefore existing behavior is inconsistent and cannot decide future input
precision by itself.

The owner described normally entering whole daily wages (1250, 1200, 1300 DZD)
and not wanting the system to add decimals. They explicitly chose option 2,
up to four fractional places, if fractional DAILY input is allowed. Record this
as optional precision, not a new requirement to type decimal wages or a setting.
Example: 1500.125 DZD/day over eight days is exactly 12001.00 DZD under
rate-first arithmetic; cent-normalizing to 1500.13 before multiplication gives
12001.04. That early normalization is not authorized. If precision exceeds four,
reject rather than silently alter the entered DAILY rate.

MONTHLY or WEEKLY explicitly agreed period amounts remain two-place references;
monthly-derived daily rates retain the exact period amount / 30 operands. This
choice concerns explicit DAILY input only, not a change to salary period views,
mandatory monthly earnings, advances/opening balances or cross-month attribution.

The exact qualified owner answer and the interpretation stated back to them
are recorded in `522-money-decisions.md`, under Owner answer: explicitly entered
daily wage. The final council's second pass must check fidelity to this answer.
No new automatic 10/20/50/100-DZD salary rounding or hidden difference write-off
is authorized. Actual UI review and all implementation/release gates remain.
