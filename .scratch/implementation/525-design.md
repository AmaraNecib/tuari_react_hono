# Issue 525 exact invoices and payments

## Baseline and authority

Worktree: `D:/worktrees/tuari_react_hono/feat-issue-525-exact-in-81cd83c9563367be`.
Base and fetched origin/develop: `67976664217b8c80d79dca85558aa5c8ee20adbb`.
Reviewed dependency head `090f181b8c29ae1e89caf096d68f4df87ae0696c` is an ancestor. Initial source tree was clean.

High-assurance financial work, focused-local / CI-final-enforced. The effective develop rules inspection returns ruleset 26837184, strict CI acceptance from app 15368 and resolved review threads. Recheck effective protection and no bypass before merge. Repository activation documents are historical pending records, not current external protection evidence.

Owner authorizes additive opt-in implementation, independent develop publication and manual owner merge only. Production appContract and numeric composition remain unchanged. No activation, migration, deletion, workforce source edits or successor dispatch. Inventory source is now explicitly assigned through owner consolidation.

Live acceptance read in full: issues 525, 520 and 336. Dependency handoff read in full from preserved 524 tree. Approved ADR and normative money contract govern rounding and ownership.

## Delivery boundary

Owner consolidated 525 and 526 into this one writer and one develop PR. This supersedes the interim approved partial-interface publication. No interface-only PR or stack will be published. Own invoice/payment and all six inventory money tables, direct services, contracts and UI paths. Payroll527 remains separate and consumes shared extensions only after actual combined develop merge.

The stopped526 tree at base67976664 had no commits or tracked changes. After reading its complete consolidation handoff and inspecting status, these named untracked drafts were copied without modifying the source tree: inventory-exact.ts SHA256 d24d7503734bdb1ac8800f40412fb3eefdb3dd4358aa9ef91d93abd9f8b4dc71; inventory-exact.test.ts a95fe690aa197f9093e9633861be8606a037145e1da0460e96f551a9e5d0fd00; 526-design.md 1b03800c77a72e1266a245bdf837811eb54d6fd7d5cc8e0cac0be93423384f92. They are untested drafts, not completed implementation. Only prior execution was missing-module red with zero tests collected, not discrimination or passing proof. The preserved design is historical planning; this consolidated authority and shared receipt plan supersede its standalone inventory journal and separate-writer dependency.

## Vocabulary and authority

An invoice owns its finalized amount and immutable currency/direction. An exact line retains its source quantity and four-place entered price or explicit agreed total. Finalize the document sum once, half away from zero. Payment allocations retain exact minor amounts, split order and original ledger payment identities. Unallocated cash is explicit, not invented debt settlement.

A producer-owned original obligation belongs to a domain aggregate. Its payments and corrections retain original attribution and producer identity. Generic debt correction, payment, void and account settlement must not bypass domain approval/allocation invariants. Unowned obligations in a mixed account remain independently usable.

Proposed producer types distinguish INVOICE, INVENTORY_PURCHASE, INVENTORY_OUTBOUND, PAYROLL_EARNINGS, PAYROLL_OPENING and PAYROLL_ADVANCE. One immutable producerId avoids nullable cross-domain foreign keys and circular schema initialization. Domain services validate their own aggregate existence before posting. Invoice provenance retains the existing invoice_id FK through an explicit validated producer DTO, never raw row injection.

## Shared transaction design

A public synchronous aggregate command wraps domain and ledger changes plus a durable aggregate receipt in one shared-FIFO immediate transaction. A debt command receipt is not an invoice, inventory or salary aggregate receipt. A replay fingerprint includes canonical complete intent and actor, excluding per-attempt transaction ID. Changed intent/actor conflicts. Callback results must be synchronous and JSON-safe. Failed domain writes, ledger writes or receipt persistence roll back the entire operation and permit retry.

Native participants must use the same database and lock. Memory participants must enlist domain snapshots with the ledger snapshot. No await inside transaction callbacks and no second lock. Existing immediate nested native transactions use savepoints.

## Caller and field matrix

| Family | Current source | Required exact behavior |
| --- | --- | --- |
| Invoice input and output | contracts/invoice.ts; invoice.module.ts | Separate exact opt-in strings, source operands, one finalization and draft restrictions |
| Invoice storage | invoice adapters; schema-definitions.ts | Inert fresh-copy exact DDL, narrow native reads and linked account/entry |
| Payment input and output | contracts/payment.ts; payment.module.ts | Exact positive amounts, partial/multiple/unallocated cash, typed validation and replay |
| Payment physical shape | initializer total_amount/amount; Drizzle amount_dzd | Initialized native introspection determines spelling; regression before declaration repair |
| Ledger producer linkage | debts-exact.ts; exact-finance.service.ts | Explicit validated invoiceId and immutable ownership; no Zod-stripped provenance |
| Shared storage gate | money-schema-gate.ts | Add agreed slice markers and physical-column refusal before legacy mutations |
| Forms and views | existing invoice inventory paths; opt-in debts/expenses precedent | Injected independent exact composition, no numeric mixed totals or active cutover |

## CI import inventory correction

PR 539 at b6b8dfd0 failed its contracts import-inventory assertion before the API suite ran. The exact-money-inventory.test.ts allowlist still described only the earlier debt/expense delivery. All ten additional direct Money/UnitPrice consumers are the isolated invoice/inventory adapters, services, forms and contracts already included in this combined scope. Add those exact paths and update the test name. Preserve the scanner, exact set equality, legacy monetary-column inventory and production route non-activation. Do not replace the list with broad directory permissions or derive expected paths from the scanner output. Reproduce the existing failure, then run the focused inventory and commerce contracts tests plus contracts typecheck. A fresh combined-delta reviewer must check this bounded test/design correction and carry the initial three-lens conclusions forward explicitly. No runtime interface or evidence UI changes.

## Verification seams

Owner-approved seams are actual application-service/RPC inputs through memory and production plain/keyed SQLite, persisted readback, exact JSON/cursor contracts, and actual affected components. Use independent literal expected values. Include failure injection, rollback, same-intent replay, changed-intent conflicts, attribution and competing native connections. Inspect initialized schema, not declarations alone.

Three distinct initial Luna review sessions are required at committed source: debate, test-audit, code-review. Same-family separate-session exception is disclosed if no enabled independent route exists. Bounded corrections receive one fresh combined-delta review. Local raw logs remain ignored; no evidence-only commits.

## Agreed downstream physical fields

Inventory version1: group gross_total_minor/paid_amount_minor/remaining_debt_minor and DZD currency; entry nullable unit_price_units plus required price_source; asset purchase_price_minor; outbound item nullable unit_price_units/price_source; charge amount_minor; revision previous_amount_minor and nullable new_amount_minor. Exact integer monetary columns replace old financial columns, not independent quantity REAL6. Group and outbound header own immutable currency. Inventory domain validates producerId as its purchase group or outbound transfer.

Workforce version1, agreed directly with527: employee and history nullable salary_reference_units, tagged nullable salary_period and nonnull DZD salary_currency; payment expected_amount_minor/actual_amount_minor and DZD currency. DAILY references use four places; MONTHLY/legacy WEEKLY two, with source-owned period validation. Legacy refusal must detect these physical columns even without marker and non-REAL legacy salary_amount_dzd/expected_amount_dzd/actual_amount_dzd. Workforce adapter itself validates required physical types. Payroll sentinel tables agreed with its owner are employee_salary_earning, employee_salary_earning_segment, employee_salary_correction, employee_salary_opening_review, employee_salary_advance, employee_salary_payment_allocation and employee_salary_settlement. There is no separate payroll aggregate receipt.

## Issue 336 boundary

525 targets exact fractional allocation sums and exact field-bound cursor validation/order in the opt-in paths. Duplicate-ID typed handling and in-transaction unallocated delete require their own named tests before claiming coverage. No blanket closure of 336, no claim that unrelated legacy transaction defects are solved.

## Applied lessons and architecture

Apply immediate reservation before decision reads, synchronous transaction composition, allocation conservation across recorded splits and shipped-prebuild native encryption proof. The historical smaller Number-based derived-default cap does not apply to approved full-range exact money; preserve checked final int64 bounds instead.

Keep ledger ownership and aggregate replay behind a small producer interface. Deleting that module would otherwise duplicate immutable attribution, authorization and receipt handling in three domain services. Do not copy balances or allocation authority into a second mutable ledger.

## Opt-in user-facing composition

ExactCommerceWorkspace composes the actual invoice/payment and inventory pages with explicit exact clients and reference data. It is not imported into the active numeric routes. Its callers must provide a prepared isolated exact backend from createExactCommerceComposition; no numeric-to-string adapter or production cutover is included.

All new commerce copy, validation messages and accessible labels use the existing Arabic i18n resource. Dynamic names and line numbers use interpolation. Component tests exercise a synthetic second locale and direction changes without enabling another production locale. Quantity remains independent numeric REAL6 for stock. Entered money and unit prices stay decimal text through localized parsing and submission.

Purchase forms retain entered price4 or agreed-total source operands. Outbound forms distinguish omitted valuation from explicit zero and carry original source quantities for derived valuation. A return creates a PAYABLE obligation, a sale creates RECEIVABLE, and a gift cannot create debt. An asset removed by outbound transfer cannot be reintroduced by an internal placement. Project contributions exclude parked-asset value from the cost total and preserve old/new charge history.

## Isolated browser entry and delegated recovery

The combined workspace has an executable isolated entry at tests/browser/commerce-exact-fixture.html. Its runner, tests/browser/commerce-exact-browser.mjs, serves loopback only and uses synthetic data, an explicit fixture identity, combined authenticated/audited oRPC composition and a fresh keyed SQLite database. This follows the existing debt browser-fixture pattern. It is not an active production route, a migration or production authentication. Both complete source and runner must be committed before capturing final evidence.

The delegated equipment-test lane had no installed dependencies and collected zero tests. Its draft was read, copied into this parent tree, corrected against actual component labels and canonical request identities, and executed with existing dependencies here. No packages were added and no peer tree was modified. The mapping lane delivered an inspected document commit; the parent corrected the table/column count, legacy Drizzle repair description and full-gross purchase obligation wording against source.

The combined native RPC test now exercises invoice payment and inventory purchase through one composition, preserving separate original producer targets even when the ledger account is shared for the same party/direction. Parent assertions filter by original obligation, not by assuming one producer per account.

## Remaining acceptance work

Complete focused equipment UI interaction proof and caller/acceptance mapping, then freeze the complete scope for the three independent initial review lenses. Resolve findings and obtain exact-head proof. Publish only the authorized combined scope. Actual-component visual evidence, owner UI approval, hosted current-head verdict, CI and manual owner merge remain separate gates.
