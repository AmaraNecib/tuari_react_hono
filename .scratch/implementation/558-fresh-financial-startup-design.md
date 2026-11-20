# Fresh financial startup for #558

Base: ee5599006c61beb7da4005d1ce36fec2c94aa99c.
Worktree: D:/worktrees/tuari_react_hono/t3-48d661ef-3ae352d3d2c079c6.
Verification mode: focused-local / CI-final-pending.
Tier: high assurance. Startup owns physical financial schemas, authenticated command composition and one shared transaction graph.

## Owner decision

The owner clarified that there is no development database and no historical data to migrate after the request to complete coordinated normal financial activation. Build the coherent fresh-database path; do not invent a historical conversion project. This does not authorize deleting files, resetting the repository, weakening schema checks, publication or hosted-policy changes.

## Required outcome

Normal createAppDependencies and createRouter must supply authenticated payroll on the same connection and ledger as other debt-producing workflows. Approved earnings retain current employee_earning identities and exact project segments. Reference salary does not cap approval or create a liability. Cash, advances, optional paired offsets and independent cash repayment retain their reviewed immutable provenance and command receipts.

No separate payroll ledger, numeric debt writer over exact tables, restricted root that disables unrelated workflows, or automatic startup conversion of an existing database is acceptable. Exact adapters and prepared compositions already exist; reuse them and close concrete contract/caller gaps. Preserve auth, RBAC, employee/project/warehouse routes, reports and financial workflows. Existing files remain untouched except named reviewed source edits.

## First proof seam

apps/api/src/rpc/payroll-startup.integration.test.ts uses ordinary createAppDependencies with a fresh file, real BetterAuth owner session, current employee creation and earning approval, and createRouter(root) without any injected payroll capability. Literal scenario: earning35000, cash25000, explicit advance5000, offset2000, independent repayment1000 leaves wages8000 and advances2000. Reopen must preserve totals and replay the same wage, offset and repayment records. Anonymous cash mutation must be refused.

Initial test attempt failed due an invalid earning request UUID and was corrected. The meaningful red now reaches cash dispatch and fails SERVICE_UNAVAILABLE: Exact payroll composition is not configured. Preserve both logs under .scratch/reviews/558-activation/normal-root-red-{1,2}.log. This is an expected implementation failure, not passing acceptance. Focused schema, authenticated integration and direct commerce regression cases will grow from the actual activation map; no routine full suite is authorized.

## Financial wire seam

`financialContract` defines `debts`, `invoices`, `inventory` and `expenses`, reusing the existing exact contracts without Number adapters or monetary shape coercion. It remains separately exported during inert preparation; `appContract` must register the `financial` namespace only in the same change that installs its normal-router handlers. The initial review caught premature public registration, which is removed before the foundation handoff. `FinancialClient` is the shared typed client for production page wiring. The parent owns this public seam and root/router composition; the schema lane does not edit contracts. Existing payroll method names remain unchanged. Legacy monetary handlers must cease to construct numeric writers on the activated graph; stale numeric calls must fail closed rather than reach a parallel ledger. Unrelated metadata and identity operations remain available.

## Fresh identity finalization

`ensureFreshApplicationIdentity` reuses phone-only auth compatibility, employee auth-link index and current role/permission seeds in one executor transaction, without executing legacy money migrations or creating monetary tables. It is inert until the selected fresh initializer calls it. Focused native tests pin stable role/permission identities on repeated finalization and rollback of all seed/DDL effects on a permission-insert failure. The existing legacy initializer is unchanged.

## Shared financial construction

`createFinancialDependencies` composes commerce, payroll and exact expenses on the caller-owned native connection/FIFO. Commerce exposes its single exact finance repository and service to payroll rather than constructing another ledger service. Middleware-free commerce/payroll service factories are shared by the existing prepared router compositions and the normal-root constructor. They do not initialize or activate schemas. Focused prepared composition/auth and invoice/inventory router regressions remain passing; the normal-root test intentionally remains red until the selected initializer and route composition are installed.

## Selected initializer and physical attestation

`ensureFreshExactApplicationSchema` initializes an empty native database under `BEGIN IMMEDIATE`, composes the DDL plan, applies transactional identity finalization, records a fresh-startup key, and checks physical schema plus exact slice markers and foreign-key integrity before commit. It refuses nonempty legacy, partial or tampered files without repairing or converting them. Reopening an attested file does not reseed or rewrite application state.

The expected physical schema is generated from current DDL in a disposable plain in-memory database with no application records or financial services. Its sqlite_master result is compared to the selected application's persistent connection; it is not a second application ledger or a second data writer. This avoids trusting a self-reported marker/hash or merely checking selected columns while missing a removed trigger. The reference handle is closed on every path. Fresh construction failure rolls back the outer transaction; identity finalization uses nested savepoints and cannot commit it early.

Focused tests construct the complete financial graph and check actual root-owned connection/FIFO identity, stable no-write reattestation, real file close/reopen on plain and keyed native drivers, legacy-file refusal without data changes, and missing-trigger refusal despite valid markers. An initial keyed-memory attempt failed because the driver requires an on-disk file; the corrected test uses isolated temporary files and preserves the failed log. Native keyed support works in the parent tree. No normal-root switch has yet been installed.

## Metadata-only workspace reads

`workspaceMetadataSchema` excludes debt accounts, debt entries and retired numeric salary payments, and rejects those extra collections rather than silently stripping them. The standalone `financialContract.metadata` read uses this organizational shape; it is not yet registered in appContract. `AuditService.getWorkspaceMetadata` reads only organizational repositories. Legacy snapshot assembly reuses that method and adds its own existing monetary collections, so unchanged legacy callers retain their old behavior until the actual fresh-root switch. The activated shell must use metadata plus separate exact financial reads, never coerce ledger balances into the legacy snapshot shape or report fabricated zero balances.

## Scope resolution in progress

A read-only Luna child maps actual normal-root financial writers/readers, prepared exact services and existing public wire contracts. It writes ignored findings only. The parent owns the startup integration test and final composition. Implementation lanes will be bounded to disjoint files only after those interface gaps are pinned. Do not infer that the absence of old data eliminates writer/reader compatibility work.
