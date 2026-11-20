# #558 financial web activation and metadata migration

Base: `e46e37dfc161ca00cf710b38365f0d2bb49e45c5`.
Worktree: `D:/worktrees/tuari_react_hono/t3-95e2b87e-65cf17ecf5c0eaf0`.
Mode: focused-local / CI-final-pending. High assurance because authenticated financial commands and recovery-sensitive caller wiring change.
Authority: WEB and this design only. No backend, contracts, transfer-history implementation, pending-intent or payroll-panel edits. The bounded correction restores the existing transfer-history route dispatch only. Parent owns review, architecture, integration and publication.

## Preserved work

Applied the complete recovery patch from the parent's `558-activation/web-metadata-sol-recovery.patch`, not a second cherry-pick. It includes the exact route adapter, dashboard/search exact reads, employee/external party debt details and external-counterparty list. Existing metadata CRUD, names, search and paging remain reachable. Normal debt, expense, inventory and invoice routes use exact pages. Invoice create/detail intent passes through the route adapter. Inventory catalog CRUD remains reachable separately from stock.

Party debt details scope by both party type and ID. Exact totals use `Money`. Manual debt payment, correction, void and settlement stay on exact lifecycle procedures; producer-owned originals retain their action restrictions. Externals join real exact accounts to counterparty metadata, including metadata-only parties. Account counts replace retired debt-case counts. No numeric financial payload adapter was introduced.

## Settled interfaces

`FinancialClient` is a standalone exported contracts type. `financialClient` binds that type at the `financial` path on the same authenticated `rpcLink` used by `AppClient`. It does not widen `AppClient` or cast its missing namespace. All active exact route, dashboard, search and detail bindings use this stable client.

`useCompositeWorkspaceQuery` now calls `financialClient.metadata`. `DemoWorkspace` aliases `WorkspaceMetadata`, so HomeView models, derived lookups and props receive metadata only. The existing user-scoped composite cache key and centralized invalidation stay intact. The contract contains roles, employees, counterparties, projects, warehouses, assignments, employee-state history and manager-ownership histories. It has no debt-account, debt-entry or salary-payment arrays.

The route adapter is a small composition adapter. Exact pages own their query and command logic. Removing the adapter would duplicate route intent and metadata mapping across HomeView callers; it does not duplicate financial calculations. No domain vocabulary changed: a salary reference is reference metadata, an approved earning is an accrual, and payroll records actual payments.

## Salary and employee callers

Removed snapshot-derived salary-payment collections and last-payment dates. Removed the employee detail legacy expected/paid/difference cards and numeric payment table. Salary references retain exact precision, zero-versus-missing behavior, period labels and state-history snapshots. Work, management and ownership histories remain metadata-driven.

The salaries page now has salary-reference workers and approved-earnings tabs. Saved `tab=recent` URLs resolve to actual approved earnings, not an invented empty payment list. Workers retain filters, route pagination, edit links and approval actions. The earnings view retains employee/project labels and the existing payroll selector/panel. Employee finance retains approved earning history, payroll and approval links. No financial zero or absent money was synthesized to satisfy the old types.

Employee deletion hints now use only metadata relationships. They cannot infer financial history from this contract. Server deletion eligibility remains authoritative and must be checked by parent integration; this lane does not claim backend enforcement proof.

## Proof and retired coverage

The composite-query regression asserts the financial metadata call and forbids `workspaceSnapshot`. A targeted mutation back to the legacy RPC fails that test, then the binding is restored. Transport tests exercise the actual oRPC client against mocked HTTP responses and assert `/rpc/financial/metadata`, browser cookies and authenticated desktop bridge dispatch. They do not prove a running backend mount.

Direct HomeView fixtures are typed `WorkspaceMetadata` without a shape cast. Employee/salary tests exercise metadata-only rendering, exact references, approval/edit links, actual earnings labels, payroll selection and saved-route compatibility. Worker-table and route-history regressions retain filtering, pagination and back/forward coverage. Existing payroll tests run unchanged.

Retired tests of snapshot-derived expected-versus-paid metrics, numeric recent-payment widgets and last-payment columns were replaced by metadata/lifecycle composition checks. The standalone legacy salary-payment-table tests remain in source; the active salaries page no longer mounts that widget. Old HomeView numeric inventory-invoice detail assertions were replaced by exact-page route-ID composition assertions. Actual exact invoice detail, command, precision and URL-intent regressions remain in `invoices-exact-page.test.tsx` and `exact-financial-route.test.tsx`.

Focused proof also covers exact debts, external list/detail composition, dashboard pending/error states, wide decimal totals, invoices, expenses, inventory and exact-commerce query/i18n behavior. Raw failures and retries stay local under `.scratch/reviews/558-web/`. Initial typecheck exposed missing built contracts; frozen dependency installation and a queued contracts build repaired the prerequisite. No dependency changes ship.

## Bounded transfer-history route correction

Correction base: `7911abc6c4d2f1148beb5956b40917fbb573b52d`. The initial code review found that `transfer-history` incorrectly shared the inventory landing-page dispatch. The dispatcher now lazy-loads the existing `TransferHistoryPage` for that route; actual inventory and other financial routes retain their exact wrappers. No history page, hook, location-history, service or contract source changes are included.

The actual HomeView route test mocks the page modules and checks both directions: transfer-history mounts history, and inventory still mounts exact inventory. With the original alias, the history case fails while inventory passes. This proves route composition only. Parent owns integration with the reviewed exact-history slice at `6cc79e80512d328554532ae987e6c6eb682f0ec4`; the worker's older history implementation is not runtime evidence for that slice. Earlier metadata, salary and financial proof remains unchanged outside this route correction. Parent obtains one fresh combined-delta review rather than restarting the initial lenses.

## Limits

No browser, server, database, full suite or production web build was run. The browser selector is recorded for parent integration, not executed under this no-browser brief. Matching backend financial handlers mount in another lane. Transfer-history implementation and exact backend query remain another lane's responsibility; the existing history page dispatch is preserved here. Hosted CI acceptance and protection activation remain pending. Parent performs independent reviews and scoped architecture review after this committed handoff.

Applied wisdom: retain centralized aggregate invalidation and granular query vocabulary; never show a financial zero for pending/error data; forward detail IDs explicitly through the HomeView seam. Candidate lesson: complete metadata migrations must update visible widgets and typed direct fixtures together, rather than supplying empty financial collections.
