# Selected exact writer-isolation root

## Pin and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-7f5196c1-7cd7d7a3be61e68d`.
Base: `29411808410ced4b7e930a58ff1d4a6a500cbbbd`.
Mode: `focused-local / CI-final-pending`. High assurance: financial ownership,
authentication, deletion/history preservation and fresh-schema composition.
This is a local implementation handoff. The parent owns independent review,
architecture review, integration and publication. No schema, initializer,
project-cost adapter, exact inventory/history or web changes are included.

The preserved recovery patch and two startup/retirement files were copied from
the parent's frozen draft. Its provisional default exact-schema flip was
removed, not promoted to production acceptance.

## Selected interface and domain

`createFreshExactAppDependencies(config, appConfig)` is an explicit alternative
to the unchanged `createAppDependencies`. It owns one native connection, one
30-second FIFO and one `createFinancialDependencies` graph. The graph owns the
exact finance service/repository used by payroll, invoices and inventory;
expenses and exact project cost share that connection/FIFO. SQLite metadata is
mandatory; an in-memory metadata adapter would split organization identities.
Construction failures close the connection; normal close is idempotent.

`FreshExactAppDependencies.mode` selects a separate branch in `createRouter`.
The legacy dependency interface still supports existing fixtures and the
normal root. The selected branch never constructs legacy FinanceService,
CompanyService, InvoiceModule, PaymentModule or numeric ExpensesModule.
CompanyMetadataService and CounterpartyService retain organization metadata.
Catalog handlers reuse InventoryService's five nonfinancial operations through
explicit bound methods, without supplying numeric debt or charge services.
The selected root exposes only that catalog capability, not InventoryService.
No Proxy or service-interface cast disguises a mixed graph.

An approved current employee earning is the labor-cost source. Cash payment,
advance, noncash offset and repayment settle ledger obligations; they do not
change project labor cost. Payroll and generic debt reads see the same account.
Employee deletion now accepts a financial-history existence port. The selected
root supplies the exact finance repository's account existence, including
settled accounts; earning existence remains guarded by its current repository.
Legacy callers retain their salary-payment history check. This avoids querying
the absent employee_salary_payment table on a selected fresh schema. The
history-free employee deletion path remains operational. Counterparty has no
delete RPC in the existing contract; restrictive native FKs preserve its debt
history even against a direct persistence deletion attempt.

## RPC and contract boundary

The existing decimal-string `financialContract` is registered at
`appContract.financial`. The only other contract change exports the existing
ORPC procedure predicate for recursive unavailable registration; no monetary
schema or endpoint signature changes.

The selected branch binds real financial, payroll, organization, counterparty,
catalog, current earning, project-cost, RBAC and security/update/backup handlers.
Stale numeric financial leaves retain their identities but authenticate and
throw BAD_REQUEST before invoking a writer. Their explicit registration lets
the compiler detect future missing flat leaves. Workforce salary handlers are
replaced explicitly. Metadata reads use `financial.metadata`.

Legacy/default composition binds every nested financial leaf to authenticated
SERVICE_UNAVAILABLE, rather than an unhandled route or fabricated zero data.
Its recursive type erasure is confined to contract registration, never service
adaptation. Selected reportsGenerate, systemLogList and workspaceSnapshot are
also explicitly unavailable. The unchanged default root retains its legacy
reports and audit behavior on its own schema.

## Native proof and failure boundaries

`payroll-startup.integration.test.ts` uses actual plain and keyed files, real
bootstrap/session authentication, employee identities and earning persistence.
Legacy constructors/factories throw if reached. The scenario creates 35,000
labor, pays 25,000, advances 5,000, offsets 2,000 and repays 1,000. Reopen reads
8,000 wages owed and 2,000 advance owed; generic debt includes that same advance
plus the separately entered 1.25 debt. Labor remains 35,000. It also exercises
native counterparty/catalog operations, exact expense create/void, selected
invoice and inventory reads, anonymous/nonowner refusals, numeric debt/payment
refusal with unchanged native total_changes, and a gated foreign FIFO holder
that prevents a financial write. Factory spies call the real implementations
and check connection/FIFO identity for metadata, finance and project cost.

A focused deletion test first failed with `no such table:
employee_salary_payment`; that failure led to the explicit history port.
Tests now refuse debt-only employee deletion, refuse deletion after actual
payroll/earning history, preserve payroll and earning reads, and allow deletion
without history. Native counterparty deletion with actual debt fails its FK.
The selected test is constructor/router proof, not HTTP transport or default
production activation proof. Separate existing tests cover root/transport
compatibility and exact payroll authentication.

Affected local selection: root dependency and create-app tests, router and
financial-router tests, exact-payroll auth integration, selected startup,
workforce coverage and company service tests. API typecheck, scoped API lint
and contracts typecheck are relevant. Native dependency installation and the
contracts build are execution prerequisites, not changes to dependencies.
Exact-SHA commands, counts, durations and preserved failures live only under
`.scratch/reviews/558-root/`.

## Architecture and remaining scope

The moved seams are the selected composition root, metadata-only handler
factories and workforce financial-history port. Deleting numeric financial
modules from the selected graph leaves native bootstrap, payroll and metadata
proof working. Shared handlers retain existing authorization and validation;
no second implementation of catalog/counterparty business rules was added.
Root lifecycle/auth/backup wiring is intentionally duplicated from the legacy
root to keep the pending default activation explicit, rather than hiding
schema selection inside the production constructor.

Applied wisdom: shared FIFO ownership for async native ports; deterministic
foreign-lock proof; real native execution because mocks/types cannot prove
transaction behavior. The advertised-but-unimplemented lesson is applied as
explicit errors, not fake success. Its preference for deleting endpoints does
not override this task's explicit unavailable-leaf requirement.

Pending: exact reports and financial system-log adapters; actual HTTP selected
application integration where required; parent architecture and three review
lenses; web integration; default production flip and full issue acceptance;
current-head CI and enforced protection. This slice makes none of those claims.
