# Currency-neutral money transition plan

Status: proposed plan requested by the owner, not implementation or migration approval. Planning source is `83f32c09330ffc9e20a5ef81ce9041ae061a31ca`, with #480 and #454 integrated. No source behavior, dependency, schema or public contract changes are included. This cross-application prerequisite work should have its own tracking issue linked to #427; creating or publishing that issue is not done by this document.

## Owner release requirement and first-PR boundary

The owner requested the inventory/first-PR scope review and confirmed that this monetary remediation belongs before v1 completion. Treat consistent money storage, arithmetic, transport, presentation and recovery across the identified application paths as a v1 release requirement. Seven PRs remain an initial review split, not an owner-mandated count. This does not require FX, selectable currencies or a general multicurrency product before v1. It does not approve the unresolved physical schema, public API, currency ownership, rounding policy or destructive operations.

The scope check against current schema source reconfirmed the 17 tables and 27 monetary fields, excluding quantities. The payment adapter still uses total_amount/amount rather than the Drizzle amount_dzd names. This is a parent scope inspection, not independent implementation review or production-driver execution.

PR1 is limited to an isolated non-writing Money module, focused tests and production-driver feasibility tests on fresh isolated test databases. No existing production import/wiring, schema initialization, migrations, financial writer, public contract export or UI changes. Currency exponent metadata and exact add/subtract/compare/parse/format may be prototyped. Candidate rounding/allocation behavior stays explicitly provisional until the owner approves financial policy. Treat the proposed module/test paths as internal until the package export decision is reviewed. Passing these tests does not authorize production activation. The exit deliverable is a tested feasibility result and a short concrete decision proposal for schema, wire representation, currency ownership and price/rate rounding.

## Recommendation and boundaries

Use currency-neutral fixed-scale Money internally, SQLite INTEGER minor units through a proven BigInt adapter, and exact serialized amounts at API boundaries. Keep user input/display in ordinary major currency units. Start production support with DZD; exercise exponent 0/2/3 in module tests without enabling FX, mixed-currency totals or a currency preference switch. Currency must be attached to an owning account/document and inherited unambiguously by children. Exact ownership and immutable currency policy need approval before schema changes.

Inspect all monetary tables now, before customers exist. Implement through seven reviewable PRs, not one large unreviewed conversion. PR count is a starting split, not a promise that every PR is independently deployable. Shared-ledger writers form a connected dependency group. Preparatory changes remain unreachable until the final approved coherent activation. If dormant integration cannot be genuinely isolated, keep the relevant PRs as a dependent unmerged stack and do not ship an unsafe intermediate head. Never keep two independently writable authoritative balances or translate large exact balances through Number merely to make an intermediate PR green.

The owner confirmed NO old real/customer data. Do not build customer-history adoption or a speculative migration framework. This is still not authority to drop/reset a database, remove fixtures/tests or discard development records. No deletion commands are part of this plan. Any discovered old-schema dev database is left untouched until a concrete non-destructive transition or explicit owner-approved alternative is selected. Schema/application compatibility on fresh startup, reopening, backup and restore still needs proof.

Ballpark implementation and proof: 8-15 engineering days for an experienced implementer, excluding owner decisions, provider waits, hosted CI/review and newly discovered scope. The pure module/driver feasibility checkpoint should take 1-2 days before committing to the production conversion. Full app money consistency is larger than #427 alone; do not claim it ships as a small salary patch.

## Inventory: 17 existing monetary tables, 27 monetary columns

All 27 observed monetary columns are currently REAL. This count includes monetary unit prices, but excludes quantities, percentages, days and other non-money columns. Two observed tables already store explicit currency: invoice and debt_entry, default DZD. Most other ownership is implicit through DZD field names or relationships. Do not assume the mere presence of a currency column means the current contracts support multiple currencies.

### Group A: shared obligations and reference wages

| Table | Current money columns and representation | Currency today | Priority and proposed treatment |
| --- | --- | --- | --- |
| `debt_account` | `current_balance`, REAL | No account currency column | P0 connected core. Proposed `balance_minor` INTEGER and immutable owning currency; inherited by entries. Approve account identity/uniqueness implications before adding currency to any key. |
| `debt_entry` | `signed_amount`, `balance_after`, REAL | Explicit `currency`, default DZD | P0 connected core. Exact signed movement and running balance, currency must match account. Corrections/voids keep traceability. No duplicate salary balance. |
| `employee` | Nullable `salary_amount_dzd`, REAL | Implicit DZD | P1 workforce slice. Proposed nullable reference `salary_amount_minor`, currency tied to an approved employment/operating-currency rule. Reference remains no automatic liability. |
| `employee_state_history` | Nullable `salary_amount_dzd`, REAL | Implicit DZD | P1 with employee. Historical reference amount and currency meaning must agree; do not erase history or confuse NULL with zero. |
| `employee_salary_payment` | `expected_amount_dzd`, `actual_amount_dzd`, REAL | Implicit DZD | P1 with salary callers. Convert monetary representation without reinterpreting expected amount as approved earnings. New #427 approval/allocation tables are separate feature work. |

### Group B: invoices and allocated payments

| Table | Current money columns and representation | Currency today | Priority and proposed treatment |
| --- | --- | --- | --- |
| `invoice` | `total_amount`, `paid_amount`, `remaining_amount`, REAL | Explicit currency default DZD; contract enum DZD only | P0 connected core because it writes the sole ledger. Exact total/paid/remaining minor amounts with document-owned currency. No implied FX support. |
| `invoice_line_item` | `unit_price`, `total`, REAL; quantity also REAL but not money | Inherits invoice meaning | P0 with invoice. Line total is quantized Money. Unit-price scale and fractional-quantity rounding need explicit policy before treating every unit price as two-decimal settled cash. |
| `payment` | Actual raw-SQL/runtime column `total_amount`, REAL | No explicit currency | P0 with invoice/ledger callers. Proposed exact payment total and owning currency. Payment sorting/cursor serialization must handle large integers. |
| `payment_allocation` | Actual raw-SQL/runtime column `amount`, REAL | Derived from linked payment/invoice, currently not enforced by currency type | P0 with payment. Exact allocation; allocations sum to intended amount and never target another currency. Retain distinct existing semantics for unallocated payments. |

### Group C: inventory invoice values and assets

| Table | Current money columns and representation | Currency today | Priority and proposed treatment |
| --- | --- | --- | --- |
| `inventory_invoice_group` | `gross_total_dzd`, `paid_amount_dzd`, `remaining_debt_dzd`, REAL | Implicit DZD | P0 connected writer boundary, P1 full inventory slice. It links/writes debt; group currency and debt currency must agree. Stored derived totals need independent reconciliation assertions. |
| `inventory_entry` | Nullable `unit_price_dzd`, `total_price_dzd`, REAL; quantity separate | Inherits group | P1 inventory slice. Exact line total; explicit nullable unit-price and scale policy. No NULL-to-zero invention. |
| `inventory_asset_unit` | `purchase_price_dzd`, REAL | Inherits purchase/group meaning | P1 inventory slice. Exact per-asset value, deterministic allocation of invoice totals where necessary, retain location and identity. |
| `inventory_outbound_transfer_item` | Nullable `unit_price_dzd`, REAL; quantity separate | No direct currency owner on transfer today | P1 inventory slice. Propose transfer-owned currency or documented inheritance; explicit agreement with linked debt account. Never infer currency from current settings. |

### Group D: charges, expenses and their corrections

| Table | Current money columns and representation | Currency today | Priority and proposed treatment |
| --- | --- | --- | --- |
| `inventory_asset_charge` | `amount_dzd`, REAL | Implicit DZD, linked to project/asset | P1 with inventory/project costs. Exact charge amount and stable currency ownership. Paying or moving an asset must not duplicate cost. |
| `inventory_asset_charge_revision` | `previous_amount_dzd`, nullable `new_amount_dzd`, REAL | Inherits charge meaning | P1 with charge. Preserve signed/domain rules and NULL for void semantics; old/new amounts in the same currency and unit. |
| `expense` | `amount_dzd`, REAL | Implicit DZD | P1 independent domain preparation, required before exact mixed-project totals activation. Exact amount and approved expense currency ownership. Preserve soft references and current CRUD semantics. |
| `expense_revision` | Nullable `previous_amount_dzd`, `new_amount_dzd`, REAL | Inherits expense | P1 with expense. Exact previous/new audit values; do not change creation/void/correction semantics while changing representation. |

### Observed schema disagreement to resolve in scope

`apps/api/src/schema/payment.ts` defines `amount_dzd` for both payment tables, while `infrastructure/database/schema-definitions.ts:697-728` creates `payment.total_amount` and `payment_allocation.amount`. The active raw SQLite repository in `modules/payment/adapters/payment.repository.ts` uses the latter. Also notes/note differ between those definitions. This is an observed static mismatch, not a claimed production incident. Base any transition on fresh initialized actual table introspection and real adapters, not solely one schema file. Bring the changed definitions into agreement and add a regression test. Do not rename unrelated columns as cleanup without need.

## Related data that is not a monetary table conversion

- `employee_salary_payment_split` currently stores only project/day attribution. Existing days stay days. New #427 segments need explicit amounts and identities, but this representation plan does not invent historical earnings from old payments.
- `inventory_consumable_balance.quantity`, `inventory_movement.quantity`, quantities on invoice/entry/outbound rows remain quantity values. Existing inventory quantity handling uses a six-decimal quantum and decimal BigInt intermediates; do not replace it with currency exponent logic or change #480 quantity behavior.
- Percentages/rates, dates, identifiers, byte sizes and counts are not Money. Recurring contracts contain amount classification metadata but no corresponding persisted monetary table was found in the inspected initializer; do not invent a recurring storage migration.
- Project-cost/debt/inventory reports, dashboard totals, workspace snapshots, system logs/audit presentation, RPCs, caches, export and backup/restore are consumers. They may carry monetary values even without their own money columns. Include them in the direct-caller inventory; no exactness claim may stop at SQL storage.
- Unit prices and derived day/average rates need explicit scale policy. Current unit-price schemas do not consistently enforce two places and fractional quantity times price creates sub-minor results. Final settled monetary totals quantize to the currency exponent; do not silently round rates before multiplication. Confirm whether entered prices are restricted to the currency exponent or permit separately typed higher-precision rates. One Money module can multiply by exact rational quantity without conflating quantity with currency.

## Priorities and dependencies

P0 means required before any exact financial writer is enabled: shared arithmetic, driver int64 proof, explicit unit/currency ownership and shared ledger plus every reachable writer. P1 means domain conversion necessary before declaring the application financially consistent. P2 means completion proof, presentation/audit and removal of now-unused conversion paths, not permission to ship inaccurate outputs meanwhile.

The shared ledger is touched directly by `company/finance.service.ts`, `invoice/adapters/invoice-debt.port.ts`, and inventory workflows in `inventory.service.ts`. Invoice and inventory paths are not outside scope just because #427 starts from employees. Salary-only conversion would not be sound. Payment allocations and invoice running totals form another tightly coupled group. Project costs combine salaries, expenses, asset charges and material quantity times price; all contributions must cross an exact same-currency interface before producing a final exact total.

## Proposed seven-PR sequence

### Preparation PRs, no production representation change

1. **Money foundation and normative contract proposal.** New isolated shared module with currency-neutral names, explicit exponent metadata and same-currency operations. BigInt internal, string parsing/formatting, rational multiplication/division, approved rounding, deterministic allocation, bounded input length and per-value/aggregate checks. Exact transport representation remains a reviewed proposal until approved. No dependency needed initially. Add adapter feasibility proof in an isolated test DB using actual production SQLCipher driver, not only built-in Node SQLite. No global safeIntegers setting. Deliverable: tested module and concrete compatibility/ownership ADR proposal. Estimated 1-2 days.
2. **Schema and repository preparation.** Align touched Drizzle/raw definitions, introduce exact repository interfaces and candidate migration/init code reachable only through tests until activation approval. Cover all 17 tables in explicit source inventory. Prove INTEGER type, int64 boundaries, scoped BigInt reads/binds and FK/index/check consistency. Document treatment of any existing dev database without destructive action. No dual authoritative balance and no startup migration activation. Estimated 1-2 days.

### Dependent domain PRs, no partial cutover

3. **Ledger, invoices and allocated payments.** Convert finance records/services/repositories, invoice/debt port, invoice line/totals, payment/allocation APIs, mappers, sort cursors and direct callers. Include explicit entry-aware targeting for salary-affected paths only after its separate policy approval; preserve unrelated obligations and do not import silent netting. No Number conversion of exact balances. Include current DZD-only boundary and currency consistency assertions. Estimates 2-3 days.
4. **Inventory amounts, charges and their debt bridge.** Convert invoice-group/entry/asset/outbound/charge/revision fields, debt-related calls and valuation inputs. Keep quantity representation/quantum unchanged, use exact rational money-times-quantity with selected price/rate policy. No new inventory behavior or duplicate debt/cost. Estimates 1-2 days.
5. **Employee reference/history and salary payment representation.** Convert the existing workforce monetary fields and callers, preserving old payment meaning and multiple-payment behavior. Keep #427 approved earnings, bonus/advance, opening and correction product changes separately reviewable; this PR alone must not claim #427 delivered or close it. Estimates 1-2 days.

### Completion and activation PRs

6. **Expenses, correction values and shared presentation/aggregates.** Convert expense/revision fields and exact project-cost, report/dashboard/workspace/audit consumers. Reuse and adapt #454 MoneyValue and grouping preference, exact inputs/form parsing and cache/cursor serialization. Preserve optional decimals and signed/zero states. Display changes require real synthetic UI evidence and explicit owner UI merge approval. Missing invoice/payment browser workflows receive direct integration plus added focused browser cases where applicable; do not claim existing inventory invoice cases cover the separate invoice API. Estimates 1-2 days.
7. **Coordinated activation and completion gate.** Wire the exact schema/repositories/contracts and every affected caller as one coherent release. Enable only when all previous scopes are integrated and reviewed, no Number/REAL path can mutate converted exact accounts, production round-trip and behavioral gates pass, and owner approves schema/contracts and UI/expensive reversal. Include backup/reopen/restore and schema-version compatibility. No irreversible drop/reset by assumption. Do not reopen closed #480/#454 to claim their past checks cover the new head. Estimates 1-2 days plus CI/owner waits.

PRs 3-6 are review boundaries, not permission to activate inconsistent representations. Before each merge, prove preparation is genuinely inert and working flows remain intact. If achieving that requires a second live ledger, fallback routing that loses digits, or a large ad hoc feature-flag system, do not do it. Keep them as a dependent unmerged review stack and ship their coherent completed result together after gates. Exact integration mechanism is decided from the first feasibility checkpoint; the safety condition is fixed.

One giant PR is not recommended because adapter, semantics, forms and reports failures become hard to isolate. Seven PRs are not seven independent releases. The final activation may have a large effective diff; current-head CI must verify that full integrated tree. Every open PR is linked/watched, receives one hosted review request per head and retains all gates. No history reset/rebase/force is part of this plan.

## Test plan: retain behavior, add precision discrimination

### A. Shared representation and storage

New proposed files: `packages/contracts/src/money.test.ts` and a scoped API driver-adapter integration test. Existing affected tests: `packages/contracts/src/index.test.ts`, `round-to-decimals.test.ts`, `salary-days.test.ts`, `debt-helpers.test.ts`; `apps/api/src/infrastructure/database/schema-definitions.test.ts`, `schema-migrations.test.ts`, `migration-runner.test.ts` and `migration-recovery.test.ts`.

Required proof:

- Parse and format exact 100, 100.50, 0.01 and large values above JS safe minor-unit range. Reject malformed forms, excess precision, unexpected signs/exponents, unknown enabled currencies and overlong inputs. Test exponents 0/2/3 without enabling those currencies in product settings.
- Same-currency add/subtract/compare; reject mismatches. Signed rounding at halfway and just below/above, division by zero, negative zero, deterministic remainder distribution such as 100 divided by3. Quantity multiplication uses independent literal expected amounts, not floating mirrors.
- Boundary below/at/above approved business maximum and signed int64 limits; aggregate and intermediate values considered separately. Never use SQL REAL promotion as overflow handling. BigInt JSON serialization must be explicit. Payment amount cursor round-trip must retain digits and tie-break order.
- Production-driver signed BigInt binds/readback and Drizzle/custom/raw mapping, repeated reopen and comparison/sort. Scoped BigInt mode must not break dates, counters or other Number consumers. Test real initialized schema with PRAGMA table_info/check inspection, not hand-written fake schema alone.
- Fresh schema creation, controlled upgrade if selected, schema version mismatch/unsupported old app behavior, interrupted transition rollback and FK/index preservation. Existing synthetic values are not silently scaled twice. Missing old precision is reported, never reconstructed.

### B. Ledger, invoice and payment behavior

Update existing `apps/api/src/modules/company/debt-writers.test.ts`, `company.service.test.ts`, `finance.service-coverage.test.ts`, `sqlite-company.repository.test.ts`; `modules/invoice/invoice.module.test.ts`; `modules/payment/payment.module.test.ts`, `payment.module.sqlite.test.ts`, `adapters/payment.repository.test.ts`; add direct integration coverage for `invoice-debt.port.ts` if its existing parent tests do not prove exact posting.

Prove both directions, sign/category rules, partial/multiple payments, allocation sums, no overpayment, zero settlement, explicit targeted mixed obligations, void/correction effect attribution and invoice running totals. New salary-linked policy is separately approved before testing it as selected behavior. Perform real SQLite failure injection, receipt replay and changed-payload conflict, immediate reservation before reads and competing-connection no-lost-update cases. Preserve unrelated entries and opening status/history. Do not weaken existing denial/error assertions merely because the output type changes.

### C. Inventory and project valuation

Update `modules/inventory/inventory.service.test.ts`, `inventory.helpers.test.ts`, `inventory-debt-sign.test.ts`, `inventory-report-money-bound.test.ts`, `inventory-transfer-charge.test.ts`, `outbound-transfer-availability.test.ts`, `item-offer-equivalence.test.ts`, `asset-charge.service.test.ts`, `adapters/sqlite-asset-charge.repository.test.ts`; `modules/project-cost/project-cost.service.test.ts`, `project-cost.integration.test.ts`, `adapters/sqlite-project-cost.repository.test.ts`.

Prove fractional quantities times price with one deliberate money rounding boundary, line/invoice/asset reconciliation, transfer directions, optional/null prices and mixed project total. Keep six-decimal quantity regression tests and #480 rounding behavior. Project returns/transfers may yield a negative material net; preserve that legitimate sign rather than clamp. Approved earnings integration later proves labor cost once despite repeated project segments and multiple cash payments. Do not claim historical cash represents earnings.

### D. Expenses, forms, rendering and reports

Update `modules/expenses/expenses.module.test.ts`, `expenses.module.sqlite.test.ts`, `rpc/handlers/expenses.test.ts`; `modules/company/report.helpers.test.ts`, `rpc/handlers/reports.test.ts`, `rpc/router.test.ts`, `company.system-log.test.ts`; `packages/contracts/src/inventory-outbound-transfer.test.ts` and affected central contract cases. Add explicit RPC rejection/round-trip tests for invoice, payment, finance, workforce and project-cost handlers where direct module tests do not cover wire formats.

Web tests to update include `features/shared/money-value.test.tsx`; `features/debts/debt-payment.test.ts`, `debt-payment-forms.test.tsx`, `debt-utils.test.ts`, `debts-mvp-web.test.tsx`; `features/employees/salary-payment-form.test.ts`, `add-salary-payment-dialog.test.tsx`; `features/app-shell/salaries-section.test.tsx`, `salary-payments-table.test.tsx`; `features/expenses/expense-form-dialog.test.tsx`, `expenses-page.test.tsx`; affected inventory create/details/outbound/charge history tests; `features/projects/project-cost-section.test.tsx`, `features/reports/report-builder.test.tsx` and dashboard/workspace tests.

Assert grouped/ungrouped optional decimals, exact large text, signs, NULL/zero distinctions, zero-as-dash, Arabic RTL and input validation. Shared formatter must not call Number on large exact input. Verify desktop WebView and browser formatting path, not Node Intl alone. Amounts and currency survive RPC/cache/audit serialization; no raw BigInt exception and no hardcoded DZD in new generic Money operations. Initial UI may still label the enabled DZD currency correctly.

### E. End-to-end, lifecycle and negative compatibility

Select affected cases through `scripts/ci/e2e-selection.mjs`. Existing browser surfaces: `tests/e2e/debt-entry.spec.ts`, `salaries.spec.ts`, `employees.spec.ts`, `expenses.spec.ts`, `inventory-invoice-create.spec.ts`, `inventory-invoice-progressive-disclosure.spec.ts`, `inventory-transfer.spec.ts`, `inventory-asset-charge.spec.ts`, `projects.spec.ts`, `workspace-snapshot.spec.ts`, `backup-settings.spec.ts`. Add missing production-reachable invoice/payment browser paths only where the actual app exposes them; otherwise prove API integration directly.

Backup tests: `modules/backup/backup.snapshot.test.ts`, `backup.service.test.ts` and relevant desktop schema/sidecar boundaries. Save/reopen/backup/restore an exact large amount using the production encryption-capable driver and verify exact value, currency, linkage and version handling. Keep untouched backups/dev DBs unchanged; use fresh isolated synthetic copies.

Use focused red-first local cases, relevant lint/typecheck and direct integration per PR. No routine full local suites/builds. Heavy justified browser/build/full work goes through heavy_run; full app tests/builds remain CI-final. Record exact base/HEAD, commands, exits, counts, durations and ignored logs. Tests mentioned here are planned changes, not executed passes.

## Decisions required before applying the plan

Approve the actual currency ownership model, initial enabled-currency policy and effects on debt-account uniqueness, not merely generic names. Approve the exact wire format, physical column names and adapter/schema transition. Choose entered unit-price/rate precision and rounding boundary for fractional quantity calculations; do not treat all rates as settled cash. Existing monetary bounds remain unless a concrete replacement is explicitly approved, with per-currency consequences and aggregates covered.

A draft default recommendation is immutable currency per obligation account/document, inherited by children, no cross-currency settlement, no FX, DZD-only product activation and string minor amounts on JSON. Those are proposals for owner review, not decisions inferred from this planning request. Reviewable dormant code is not permission to apply a migration. Every UI change and expensive-to-reverse non-UI merge still requires explicit owner approval.

## Relationship to #427 and completion

This plan changes representation, not salary product rules. #427 remains open until approved earnings, independent allocations, bonus/advance classification, opening review, correction audit, explicit settlement, atomic/idempotent writes and UI acceptance are delivered. #449 monthly presentation remains separate. Do not hide the money program under a PR claiming to close #427 or reopen closed peers. When authorized, track money consistency under its own issue and link its prerequisites to #427.

Completion means all 17 monetary tables are accounted for, schema definitions agree on changed fields, every reachable money writer and aggregate has an exact path or an explicitly approved boundary, full integrated current-head CI and hosted verdicts pass, and owner approval gates are met. No release-readiness or merge claim is made by this planning document.

## Evidence sources and limitations

Table inventory comes from `apps/api/src/schema/{company,invoice,payment,inventory,expenses}.ts` and full CREATE TABLE/amount scan in `apps/api/src/infrastructure/database/schema-definitions.ts`. The payment mismatch was checked against the actual raw SQLite payment adapter. Arithmetic/caller evidence includes FinanceService, InvoiceModule and invoice-debt port, InventoryService, inventory.helpers, ProjectCostService, repository Number mappings, shared MoneyValue and contracts. Test names were read from repository file listings, not guessed test execution. No tests, database writes, installed dependencies or app code changes were needed to produce this plan.
