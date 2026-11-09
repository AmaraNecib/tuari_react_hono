# Spec: exact monetary amounts across the application before v1

Draft for owner approval. Intended publication: GitHub specification issue labelled `ready-for-agent`, with explicit unresolved-decision blockers and `status:blocked` until cleared. The label never grants schema, policy or implementation activation authority. No implementation is started by this spec.

## Problem Statement

An operator must trust that a salary, debt, invoice, payment, inventory valuation and project total retain the same amount wherever they are entered, stored, allocated, paid, reported or restored. Current monetary fields use binary floating-point REAL/number values. Rounding some outputs cannot protect exact balances or allocation sums. A salary-only repair leaves other writers able to change the same debt accounts through a lossy representation.

The owner requires every financial table to use the new exact approach before releasing v1. There are no real/customer records to adopt, so this is the time to establish consistent representation. Development records, fixtures and databases still must not be deleted without authority.

## Solution

Use one currency-neutral money representation and exact arithmetic throughout the application. Ordinary users continue entering and reading familiar major-unit amounts. The system persists exact minor amounts and carries currency explicitly or through an approved immutable owner. All producers and consumers of an amount agree on its unit and currency. Higher-precision unit prices are explicitly typed according to approved policy, rather than silently rounded like settled cash.

Start from [Salary v1: approved earnings, flexible project allocations, payments and opening balances](https://github.com/AmaraNecib/tuari_react_hono/issues/427), preserve its acceptance and extend exact monetary representation to the rest of the application. Only DZD activation is proposed for this release; generic naming does not promise FX or multicurrency product features.

## User Stories

### Entering and reading amounts

1. As an operator, I want to enter ordinary currency amounts, so that internal minor units do not complicate my work.
2. As an operator, I want invalid precision rejected clearly, so that the application never changes my entered amount silently.
3. As an operator, I want large amounts to retain every digit, so that saving and reopening never changes their value.
4. As an operator, I want existing grouping and optional-decimal preferences preserved, so that exactness does not make figures harder to read.
5. As an operator, I want blank, unreviewed and zero states distinguished, so that missing information does not become a false settled balance.

### Obligations and payments

1. As an accountant, I want each debt movement and running balance to use exact amounts, so that reconciliation does not depend on floating tolerance.
2. As an accountant, I want amounts owed to us and amounts owed by us kept distinct, so that a gross exposure report never pretends to be a net position.
3. As an operator, I want partial and multiple payments to reconcile exactly, so that a fully settled obligation has no invented remainder.
4. As an operator, I want allocations to sum exactly to their intended amount, so that mathematically valid fractional splits are accepted.
5. As an operator, I want corrections, voids and replayed submissions handled atomically and traceably, so that retrying or correcting does not duplicate money or affect unrelated obligations.

### Salary v1 origin

1. As an employer, I want reference salary, approved earnings and payments kept distinct, so that a reference alone never invents debt.
2. As an employer, I want project allocations plus explicit unallocated earnings to equal approved earnings, so that labor cost reconciles once.
3. As an employer, I want repeated project segments to retain independent exact amounts, so that equal days do not force equal earnings.
4. As an employer, I want unpaid approved earnings and recoverable advances represented without silent netting, so that I know the direction of each obligation.
5. As an operator, I want opening balances and audited corrections to retain exact values, so that later payments do not erase or recreate prior obligations.

### Purchases, stock and expenses

1. As a purchaser, I want invoice line totals, paid amounts and remaining amounts to reconcile exactly, so that invoices and debt accounts agree.
2. As an inventory operator, I want fractional quantities multiplied using an approved price precision and rounding boundary, so that stock valuation is predictable.
3. As an inventory operator, I want asset values, transfers and related debt to retain consistent currency and amounts, so that movement does not create a second cost or obligation.
4. As a project manager, I want equipment charges and expense corrections to preserve old and new monetary values, so that history remains auditable.
5. As a project manager, I want salary, material, equipment and expense contributions combined exactly, so that project totals agree with their sources.

### Release and recovery

1. As an operator, I want reports, dashboards, audit views and exports to show the same exact amounts, so that changing views does not change financial facts.
2. As an operator, I want sorting and pagination of large amounts to remain correct, so that no record disappears or repeats because its amount lost digits.
3. As an operator, I want reopening and backup/restore to preserve amounts, currency and links, so that recovery does not corrupt my accounts.
4. As a maintainer, I want initialization and runtime schema definitions to agree, so that fresh installations and checked transitions behave consistently.
5. As the owner, I want v1 release blocked until every monetary table and reachable path has been converted and verified, so that no partial precision upgrade reaches customers.

## Implementation Decisions

### Requirements already established

- Complete application-wide monetary consistency before v1. The current inventory has 17 tables and 27 monetary/rate columns. Recheck completeness before activation and include new salary monetary tables introduced during delivery.
- Use currency-neutral names. Minor-unit persistence is accepted in principle, not as approval of exact column names or migration commands. Keep quantities, days and percentages outside Money.
- Preserve existing product semantics while changing representation. The salary origin remains separately accountable for approved earnings, allocations, advances, opening and correction behavior. Never infer old earnings from reference salaries or cash payments.
- Keep one authoritative debt ledger with explicit directions. No second writable salary balance, no silent netting and no float bridge that claims full-range exactness.
- Use dependent reviewable scopes. This is a wide refactor where necessary: expand interfaces without activation, migrate call sites in bounded groups, then contract and integrate. Use a dependent integration sequence if batches cannot stay green independently. No unsafe partial release.

### Proposed defaults, not yet approved physical contracts

A private Money representation uses BigInt and currency metadata, SQLite int64 stores minor amounts through a proven narrow adapter, and JSON carries exact strings rather than raw BigInt or floating numbers. DZD is the proposed initially enabled currency, while isolated arithmetic tests cover exponent 0/2/3. Currency belongs immutably to an approved account/document owner and children inherit it. These defaults require the financial-contract decision ticket before public contracts or schema are changed.

### Known unresolved decisions

The runtime feasibility decision must establish what the actual production plain/encrypted bindings can bind and read, whether the encrypted runtime can be built, and the smallest compatible adapter and activation/backup strategy. Node's built-in SQLite result is not production proof.

The human financial-contract decision must approve currency ownership and account identity, wire and physical representation, business and aggregate bounds, unit-price/rate precision, rounding boundaries, and handling of any existing development schema without deletion. Rounding signed values and fractional-quantity totals must not be inferred by the implementer. Salary downward-correction excess treatment remains an origin issue decision, not an arithmetic library default.

### Table coverage

| Slice | Existing monetary tables | Required values |
| --- | --- | --- |
| Shared obligations | debt_account; debt_entry | Exact current/running balances and signed movements |
| Invoices and payments | invoice; invoice_line_item; payment; payment_allocation | Exact totals and allocations; approved price/rate scale |
| Workforce | employee; employee_state_history; employee_salary_payment | Exact nullable reference/history and expected/actual cash amounts; new approved-earnings records also use the shared representation |
| Inventory | inventory_invoice_group; inventory_entry; inventory_asset_unit; inventory_outbound_transfer_item; inventory_asset_charge; inventory_asset_charge_revision | Exact purchase totals, asset/transfer values, charges and correction values |
| Expenses | expense; expense_revision | Exact current and old/new correction amounts |

The active payment adapter and SQL initializer use total_amount/amount while the Drizzle definitions use amount_dzd. Resolve the actual runtime disagreement with initialized-table tests rather than renaming from a single assumed schema.

## Testing Decisions

Pending owner confirmation of the following test seams before publication:

1. Prefer the existing public application-service/RPC behavior over implementation mocks. Exercise real SQLite repositories through those services for create, allocate, settle, correct, void and read-back scenarios. Use independent literal expected amounts and persisted state to detect mistakes.
2. Add narrow native-driver proof for signed int64 BigInt binding/readback, production encryption-capable reopen and backup. These cannot be established by service mocks or a different SQLite binding. Track an unresolved external encrypted-binding issue honestly, not as a pass.
3. Test wire serialization and existing shared money rendering/forms at their boundaries. Use focused browser tests only for affected user workflows and desktop/browser compatibility. No new generic repository abstraction merely to make tests easier.

Prior art exists in salary/debt writer tests, payment and expense real-SQLite tests, inventory rounding and valuation tests, project-cost integration, MoneyValue rendering and backup snapshot tests. Preserve negative and atomicity cases while changing types. Add boundary/overflow, exact 0.1 plus 0.2, repeated allocation remainder, currency mismatch, NULL/zero, cursor, replay and competing-connection cases. Preserve the six-decimal quantity behavior independently from money.

Focused failing-first local proof, affected lint/typecheck, three required independent review sessions and exact-head CI/hosted review gates apply. Run heavy justified work through the queue. This draft reports no executed implementation tests or external verdicts.

## Out of Scope

- Exchange rates, selectable currencies, cross-currency totals or settlement and a full multicurrency UI.
- Tax, statutory payroll, compulsory attendance, automatic historical reconstruction or silently selected salary policies.
- Treating quantities, percentages or days as money, or rewriting existing quantity rounding.
- Customer-data adoption machinery for nonexistent customers, deletion/reset of dev data, unvetted packages or a speculative database framework.
- Taking over encryption/coverage/glossary follow-up issues or closing any existing issue by implication.

## Further Notes

The Wayfinder map is the index of unresolved decision tickets; this spec owns desired behavior and coverage; execution tickets own acceptance for bounded delivery. They must link rather than repeat decision answers. Existing issues remain open until their own acceptance is independently met.

Known external constraints: [api: better-sqlite3-sqlcipher 5.4.3-3 cannot build on Node 22 — the encrypted_db binding has never been producible](https://github.com/AmaraNecib/tuari_react_hono/issues/500) and [build-sidecar silently ships without SQLCipher while APP_DB_KEY is set (encrypted_db licenses get a plain DB)](https://github.com/AmaraNecib/tuari_react_hono/issues/402). Verify current source and hosted outcomes before choosing hard blocking edges; an open issue description is a constraint to investigate, not a new package approval.

The payment conversion overlaps the exact fractional sums and cursor portion of [API: payment module robustness follow-ups](https://github.com/AmaraNecib/tuari_react_hono/issues/336). Do not close that issue for partial coverage. Coordinate vocabulary with [Add the salary domain to the glossary](https://github.com/AmaraNecib/tuari_react_hono/issues/455) and [Debt glossary and an ADR for gross-vs-net outstanding](https://github.com/AmaraNecib/tuari_react_hono/issues/457), rather than inventing a second glossary or rewriting those issues.

v1 exit requires exact paths for every money table and reader/writer, no reachable lossy conversion, production-driver and recovery proof, approved owner-only decisions, passed current-head CI and hosted review, plus the salary origin's complete acceptance. Money conversion alone cannot close Salary v1.
