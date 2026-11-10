# Exact-money caller matrix, inert foundation

Source baseline `17d6277bee359a059d0af5d5befaa887446fae9b`. This is the conversion inventory for #523, not a claim that these callers have been converted. All existing readers and writers remain numeric and unchanged. No new physical monetary fields are introduced by #523.

The approved [27-field semantic map](../../.scratch/implementation/522-money-field-classification.md) supplies meaning. This document adds physical readers/writers, transport and downstream consumers. F means finalized amount, S period-tagged reference, P entered four-place price, R source-preserving derived ratio, I exact line intermediate. Existing sign/null rules still apply.

## Column-to-caller matrix

Each row inherits G for initialization, generic SQL, snapshot/recovery and shared rendering. Family IDs below name concrete source files and operations. The row's consumer IDs include derived/report/audit paths, not only direct SELECTs. No row authorizes activation.

| Physical column | Class | Writer | Reader / transport / consumers |
| --- | --- | --- | --- |
| employee.salary_amount_dzd | S | W | W, A, U, T-W |
| employee_state_history.salary_amount_dzd | S snapshot | W | W, A, U, T-W |
| employee_salary_payment.expected_amount_dzd | F | W | W, A, U, C, T-W |
| employee_salary_payment.actual_amount_dzd | F | W | W, A, U, C, T-W |
| debt_account.current_balance | F signed | D, W, N, P | D, A, U, R, T-D |
| debt_entry.signed_amount | F signed | D, W, N, P | D, A, U, R, T-D |
| debt_entry.balance_after | F signed snapshot | D, W, N, P | D, A, U, R, T-D |
| inventory_invoice_group.gross_total_dzd | F | I | I, V, R, T-I |
| inventory_invoice_group.paid_amount_dzd | F | I | I, V, T-I |
| inventory_invoice_group.remaining_debt_dzd | F | I, D | I, V, D, T-I |
| inventory_entry.unit_price_dzd | P/R | I | I, V, C, R, T-I |
| inventory_entry.total_price_dzd | I/F | I | I, V, R, T-I |
| inventory_asset_unit.purchase_price_dzd | F | I | I, H, V, C, R, T-I |
| inventory_asset_charge.amount_dzd | F | H | H, V, C, T-I |
| inventory_asset_charge_revision.previous_amount_dzd | F snapshot | H | H, V, T-I |
| inventory_asset_charge_revision.new_amount_dzd | F nullable snapshot | H | H, V, T-I |
| inventory_outbound_transfer_item.unit_price_dzd | P/R | I | I, V, R, T-I |
| invoice.total_amount | F | N | N, P, T-N |
| invoice.paid_amount | F | N, P | N, P, T-N |
| invoice.remaining_amount | F | N, P | N, P, D, T-N |
| invoice_line_item.unit_price | P/R | N | N, T-N |
| invoice_line_item.total | I/F | N | N, T-N |
| payment.total_amount | F | P | P, T-P |
| payment_allocation.amount | F | P | P, N, T-P |
| expense.amount_dzd | F | E | E, X, C, T-E |
| expense_revision.previous_amount_dzd | F nullable snapshot | E | E, X, T-E |
| expense_revision.new_amount_dzd | F snapshot | E | E, X, T-E |

## Concrete persistence and calculation families

Paths in this section are relative to `apps/api/src/modules/`.

| ID | Files and operations |
| --- | --- |
| W | `company/workforce.service.ts`, employee create/update/history and salary proposal/payment; `company/adapters/sqlite-workforce.repository.ts` delegates to `company/adapters/sqlite-company.repository.ts`, employee/history CRUD, salary payment/split insert/list; `company/company.repository-mappers.ts`, `mapEmployee`, `mapEmployeeStateHistory`, `mapEmployeeSalaryPayment`; `company/workforce.repository.ts`, `company/company.repository.contracts.ts`, `company/company.types.ts`, reference and payment interfaces. `workforce/employee.module.ts` also maps and writes reference fields through `workforce/adapters/employee.repository.ts`, which delegates save/upsert and paged reads to the company repository. `company/company.helpers.ts` normalizes references and signed postings; `company/report.helpers.ts` bounds existing numeric report sums. `packages/contracts/src/salary-days.ts` outside this prefix calculates numeric proposals and salary project allocations. |
| D | `company/finance.service.ts`, account create, post/void/recompute/settle, debt reports; `company/adapters/sqlite-finance.repository.ts` delegates to `company/adapters/sqlite-company.repository.ts`, account/entry CRUD and running balances; `company/company.repository-mappers.ts`, `mapDebtAccount`, `mapDebtEntry`; `company/finance.repository.ts` and `company/company.types.ts`; `invoice/adapters/invoice-debt.port.ts` connects invoice operations to this same ledger. No second balance. |
| I | `inventory/inventory.service.ts`, invoice group create/pay, consumable products, asset individual totals/mean, transfer validation/creation, inventory/movement reports; `inventory/adapters/sqlite-inventory.repository.ts`, entry/group/asset/outbound CRUD and projections; `inventory/inventory.repository.ts`, `inventory/inventory.types.ts`, `inventory/asset-charge.types.ts`. `inventory/inventory.helpers.ts` handles quantity arithmetic only, and `inventory/inventory.storage.ts` stores attachments, not monetary records. The asset mean is total/count, not an entered four-place price. Outbound valuation can originate in a derived mean. |
| H | `inventory/asset-charge.service.ts`, placement default from prior charge or purchase price, override, revise, void; `inventory/adapters/sqlite-asset-charge.repository.ts`, charge/revision CRUD and histories; `inventory/asset-charge.repository.ts`. A placement charge is a finalized event, not a daily rental rate. |
| N | `invoice/invoice.module.ts`, line multiplication, draft update, final total/status and debt synchronization; `invoice/adapters/invoice.repository.ts`, invoice/line mapping, insert/update/delete/list/find and dynamic filter/cursor SQL; `invoice/invoice.repository.ts`, `invoice/invoice.types.ts`. No generic-invoice money UI is wired in this source baseline. |
| P | `payment/payment.module.ts`, allocation equality/capacity, payment recording and invoice balance updates; `payment/adapters/payment.repository.ts`, raw SQL create/read/list/void, `mapRowToPayment`, `mapRowToAllocation`, numeric money cursor/sort encode/decode; `payment/payment.repository.ts`, `payment/payment.types.ts`. Payment and invoice repositories share transactional effects. No generic-payment money UI is wired in this source baseline. |
| E | `expenses/expenses.module.ts`, create/update/void with revisions; `expenses/adapters/sqlite-expenses.repository.ts`, expense/revision write/read/map/list filters; `expenses/expenses.repository.ts`, `expenses/expenses.types.ts`. Revision JSON `changed_fields` records field names, not a separate writable money amount. |
| C | `project-cost/adapters/sqlite-project-cost.repository.ts`, salary payments/days/splits, expense/charge/asset purchase and material movement queries; `project-cost/project-cost.service.ts`, payment/days source ratios, labor allocation and material/equipment/expense totals; `project-cost/project-cost.types.ts`, `project-cost/project-cost.repository.ts`. These derived report amounts are not new persisted fields. |

In-memory alternatives are also conversion callers: `company/adapters/inmemory-store.ts`, `shared.ts`, `inmemory-workforce.repository.ts`, `inmemory-finance.repository.ts`, `inmemory-audit.repository.ts`; `invoice/adapters/in-memory-invoice.repository.ts`; `payment/adapters/in-memory-payment.repository.ts`; `inventory/adapters/in-memory-asset-charge.repository.ts`; `expenses/adapters/in-memory-expenses.repository.ts` and their repository interfaces. They are not proof of native driver behavior. `company/company.test-helpers.ts` is a fixture writer, not production initialization.

## Transport and downstream caller families

Paths are repository-relative. Prefixes in the table are literal directories.

| ID | Concrete files and routes |
| --- | --- |
| T-W | `packages/contracts/src/workforce.ts`, `workforce-contract.ts`, `salary-days.ts`, `workspace.ts`, `app-contract.ts`; `apps/api/src/rpc/handlers/workforce.ts`, `handler-inputs.ts`, workforce endpoints and their snapshot shape. |
| T-D | `packages/contracts/src/debts.ts`, `debts-contract.ts`, `debt-helpers.ts`, `reports.ts`, `reports-contract.ts`, `workspace.ts`; `apps/api/src/rpc/handlers/finance.ts`, `handler-inputs.ts`, account/entry/payment/settlement/void/report endpoints. |
| T-I | `packages/contracts/src/inventory.ts`, `inventory-contract.ts`, `inventory-item-usage.ts`, `reports.ts`; `apps/api/src/rpc/handlers/inventory.ts`, `handler-inputs.ts`, group/entry/transfer/charge/history endpoints. |
| T-N | `packages/contracts/src/invoice.ts`, `invoice-contract.ts`; `apps/api/src/rpc/handlers/invoice.ts`, invoice/line CRUD, filters and cursor. |
| T-P | `packages/contracts/src/payment.ts`, `payment-contract.ts`; `apps/api/src/rpc/handlers/payment.ts`, payment create/list/detail/void, allocation output and cursor. |
| T-E | `packages/contracts/src/expenses.ts`, `expenses-contract.ts`; `apps/api/src/rpc/handlers/expenses.ts`, amount input, list/detail/revision output. |
| A | `apps/api/src/modules/company/audit.service.ts`, `getWorkspaceSnapshot` returns employee/history/salary/ledger values; `company.system-log.ts`, `buildCompanySystemLog` and `formatSignedDzd` construct salary/debt details. `adapters/sqlite-audit.repository.ts` delegates to the company repository. `apps/api/src/rpc/handlers/system.ts`, `packages/contracts/src/system-log.ts`, `system-contract.ts`, `workspace.ts`; `apps/web/src/features/app-shell/system-log-section.tsx` renders details. `apps/web/src/features/audit/audit-log-page.tsx` exports system-log summary strings as CSV, not raw monetary columns or detail values. |
| U | `apps/web/src/features/app-shell/workspace-queries.ts`, `workspace-mutations.ts`, `home-view-derived-employees.ts`, `home-view-derived-employee-salary.ts`, `home-view-derived-employee-history.ts`, `home-view-derived.ts`, `home-view-derived-formatters.ts`, `dashboard-metrics.ts`, `dashboard-section.tsx`, `salaries-section.tsx`, `salaried-workers-table.tsx`, `salary-payments-table.tsx`, `salary-table-primitives.tsx`; `features/employees/employee-batch-schema.ts`, `employee-batch-row-card.tsx`, `employee-batch-create-page.tsx`, `employee-edit-page.tsx`, `employee-details-page.tsx`, `employee-table.tsx`, `use-employee-inline-create.ts`, `salary-payment-form.ts`, `add-salary-payment-dialog.tsx`; `features/debts/debts-queries.ts`, `employee-debt-hooks.ts`, `debt-utils.ts`, `debt-payment.ts`, `debt-payment-preview.tsx`, `debt-ledger-panel.tsx`, `debt-cases-panel.tsx`, `debt-party-summary-card.tsx`, `debt-create-page.tsx`, `debts-hub-page.tsx`, `record-payment-dialog.tsx`, `record-entry-payment-dialog.tsx`, `void-entry-dialog.tsx`, `consolidation-dialog.tsx`; external/project/warehouse details pass linked debt records through these shared modules. |
| V | `apps/web/src/features/inventory/inventory-hooks.ts`, `inventory-invoice-create-page.tsx`, `inventory-invoices-page.tsx`, `inventory-invoice-details-page.tsx`, `item-list-editor.tsx`, `record-invoice-payment-dialog.tsx`, `asset-charge-history.tsx`, `outbound-transfer-create-page.tsx`, `outbound-transfer-create-page-v2.tsx`, `outbound-transfers-page.tsx`, `transfer-item-dialog.tsx`, `multi-source-item-picker.tsx`, `transfer-history-hooks.ts`, `transfer-history-page.tsx`, `location-transfer-history.tsx`, `inventory-location-contents-section.tsx`. These are inventory invoices, not generic invoice/payment contract screens. |
| X | `apps/web/src/features/expenses/expense-form-dialog.tsx`, `expenses-page.tsx`, `expenses-queries.ts`, `expenses-filters.ts`, current/revision display and inputs. |
| R | `apps/api/src/rpc/handlers/reports.ts` dispatches debt/inventory/movement reports; `project-cost.ts` dispatches project totals. `packages/contracts/src/project-cost.ts`, `project-cost-contract.ts`, `reports.ts`, `reports-contract.ts`; `apps/web/src/features/projects/project-cost-queries.ts`, `project-cost-section.tsx`, `hooks/use-report-queries.ts`, `formatReportAsCSV`, `features/reports/report-builder.tsx`. CSV carries financial aggregate values, not just rendered labels. Dashboard derives from workspace and shared report/debt data. |

All RPC families pass through `apps/api/src/rpc/router.ts`, `rpc-middleware.ts`, `apps/api/src/app/dependencies.ts` and `apps/web/src/lib/orpc-client.ts`. Output validation remains numeric. None imports the new exact-money capability.

## G, storage-wide and shared paths

1. **Physical initialization and declarations.** `apps/api/src/infrastructure/database/schema-definitions.ts` contains the 27 CREATE fields plus repeated historical ALTERs. `schema.ts`, `ensureDatabaseSchema`, runs actual startup checks, backfills and table rebuilds, including dynamically interpolated table metadata inspection. `migration-runner.ts` is a separate manifest runner, not the startup money activation point. `apps/api/src/schema/company.ts`, `inventory.ts`, `invoice.ts`, `payment.ts`, `expenses.ts` declare the same domains through Drizzle. The initializer and active payment repository use `payment.total_amount` / `payment_allocation.amount`; payment Drizzle declarations use `amount_dzd`. Do not migrate either spelling in isolation.
2. **Generic execution and transactions.** `apps/api/src/infrastructure/database/factory.ts`, parameter-normalizing statement proxy; `sqlite-executor.ts`, generic execute/query and transaction ownership; `drizzle.ts`, Drizzle construction; `apps/api/src/types/sqlite.ts`, native driver type; company/inventory repository transaction helpers and `apps/api/src/infrastructure/database/fifo-lock.ts` transaction ownership and `apps/api/src/modules/shared/cursor.ts` cursor encoding. Generic SQL and `SELECT *` inherit the row mapper's conversion obligations. Default numeric native reads remain intentionally unchanged. The new adapter accepts only a single explicitly aliased projection, so IDs/flags/timestamps cannot leak as BigInt.
3. **Backup, keys and restoration.** `apps/api/src/modules/backup/backup.snapshot.ts` copies the whole database with worker `VACUUM INTO`, including all tables and revision data, not per-field codecs. `backup.service.ts`, `backup.scheduler.ts`, `backup.settings.ts`, `backup.policy.ts`, `backup.types.ts`, RPC `handlers/backup.ts`, contracts `backup.ts`/`backup-contract.ts`, web `backup-hooks.ts`/`backup-settings.tsx`; `database-key-manager.ts` uses full-file export/rekey/read checks. `docs/backups.md` describes closed-app manual recovery. Desktop `scripts/sqlcipher-encryption-proof.mjs` and packaging/staging scripts validate copied runtimes/snapshots, not application money conversion. All remain untouched.
4. **Shared entry/rendering.** `apps/web/src/components/ui/currency-amount-input.tsx`, `features/shared/money-value.tsx`, `features/preferences/money-format-preference.ts`, `money-format-setting.tsx`, `features/app-shell/home-view-derived-formatters.ts`, shared form/table primitives. Existing localization/grouping and optional-decimal behavior stays numeric until its own conversion. The new strict codec accepts ASCII canonical decimal strings only; it does not replace localized UI parsing.
5. **Composition, alternate adapters and fixtures.** `apps/api/src/app/dependencies.ts` selects native repositories and initializes before traffic; company service delegates its workforce/finance/audit modules. In-memory adapters and test fixture writers are named above. Existing generated dist, node_modules, historical plans, screenshots and fixture databases are not additional production callers. No second live money schema is created by the foundation.

## Exhaustiveness method and limits

The inventory starts from every initializer CREATE TABLE REAL field, excluding quantity. It covers 27 columns across 17 tables, independently checked against the Markdown rows by the focused inventory test. Searches include SQL table/column spellings, Drizzle symbols, camelCase monetary aliases, repository ports and method callers across `apps/api/src`, `apps/web/src`, `packages/contracts/src` and desktop scripts. Dynamic metadata, generic query execution, audit strings, CSV and whole-file backup/key operations are separately named above because column-name searches alone miss them.

The caller families intentionally include connected forms, hooks, validators, mappers, sort/cursors and derived reports, rather than treating a schema declaration as a reader/writer inventory. Test-only occurrences, generated output and historical documents are excluded as runtime callers. No additional initialized monetary field was found. `packages/contracts/src/recurring.ts` also declares optional `fixedAmountDzd` and formula metadata, but has no initialized table, active repository or RPC operation in this baseline. It is an unactivated contract placeholder, not permission to implement recurring finance. `apps/web/src/i18n/resources/ar.ts` supplies amount/price labels rather than values. Allocation project/day splits store identities/days, not independent monetary values. Report day rates, asset means, line intermediates and summary totals are derived non-column values and remain conversion obligations.

This is a pinned-source inventory, not an automated proof that future callers cannot appear. Successor issues must refresh it against their actual source and prove execution through their changed public interfaces. Design acceptance, static coverage, native capability proof, coordinated activation, recovery and packaged release remain separate claims.
