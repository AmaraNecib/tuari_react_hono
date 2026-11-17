# #543 original-page integration

## Revision and verification

- Worktree: `D:/worktrees/tuari_react_hono/t3-9f3476b8-76577619c9213797`
- Base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f`
- Reused source: `ec783452375bcf2c54523b830236eebb9e046738`
- Backend dependency: `00db1855021a84897a43f81fd8349f8b0eab5aaf`, plus correction `a39105cf2f2cb914c70f29ddc9e6399e4fdd6b56`; API/contracts paths were clean before both cherry-picks.
- Verification mode: `focused-local / CI-final-pending`
- Tier: high-assurance. Employee identity, exact salary references, and approved earnings affect money and durable recovery.
- Owner's requirement: "all page to have the original pages not the symplified version."

Issue #543 is the acceptance source. PR #541 and its source-owning tree remain untouched. This lane does not publish, add dependencies, change API/contracts, or widen scope to later payroll slices.

## Original-component map

| Route | Original component | Shared production JSX / extraction | Exact adapter |
|---|---|---|---|
| `/employees` | `EmployeeTable` inside `EmployeesSection` | `EmployeeTable`, `RecordPageFrame`, `AdvancedSearchBar`, original action group, delete and leave confirmation flows | `ExactEmployeeTable` calls paged exact employee APIs, maps profile fields to the table display row, and sets numeric salary fields to `null`. Exact money never becomes a JavaScript number. The retired payment dialog and action are disabled for this route. |
| `/employees/create` | `EmployeeBatchCreatePage` and `EmployeeBatchRowCard` | Original page heading, descriptions, row cards, manager/project controls, add/remove row actions, and single/batch mode switch | `ExactEmployeeCreateForm` validates and serializes salary text with `SalaryReference` and exact-money parsers; it submits through `ExactEmployeeClient`. It does not call numeric salary APIs. |
| `/employees/:id/edit` | `EmployeeEditPage` | Pinned `EmployeeEditForm`, the original personal/work/salary sections, placement controls, managed-scope controls and footer actions | `ExactEmployeeEditPage` loads and saves exact employee records. `salaryReference` remains a canonical string. |
| `/employees/:id` | `EmployeeDetailsPage` | `RecordPageFrame`, `RecordTabs`, `RecordTabPanel`, `RecordInfoCard`, `RecordHistoryTable`, delete confirmation and debt panel | Exact employee and state-history reads feed profile, reference-salary, history, and debt views. Assignment history is supplied by the authenticated application client. The finance tab links to explicit monthly approval; it does not expose legacy cash writes. |
| `/salaries` | Existing salaries workspace route | Existing monthly editor, production form controls, `Surface`, `PageHeader`, `MoneyValue` | `ExactSalaryEarningsSection` uses `ExactWorkforceEarningsClient`, explicit ordered segments, unallocated amounts, account-scoped recovery and exact readback. |
| `/projects` and `/warehouses` and their detail/create/edit routes | Original project and warehouse page components | `ProjectsSection`, `WarehousesSection`, original create/edit/detail forms, overview/history/team/item/transfer tabs and loading/error states | `ExactProjectWarehousePages` adapts authenticated application records. Project cost uses the narrowed exact earnings client. Capability mode suppresses only the retired cost adapter, not supported original nonfinancial tabs. |
| `/` | `DashboardSection` inside the original signed-in shell | Original dashboard composition, labels, shell, sidebar and exact global-search flow | Exact application queries supply nonfinancial counts. Unsupported financial summary values stay unavailable rather than showing fabricated zeroes. |

The employee table deliberately keeps the original columns. Exact salary references appear in the employee record and finance tab, not as a fabricated numeric column. The detail history combines exact salary-reference state changes with assignment history.

## Money and deferred scope

- Employee salary references and approval amounts remain canonical exact strings through form parsing, adapters, query results and display.
- The original numeric employee table remains available for its separate legacy caller, but exact routes set `allowLegacySalaryPayments={false}` and do not mount its payment dialog.
- Employee details do not mount the numeric quick-payment mutation.
- Approval and project-cost routes use `ExactWorkforceEarningsClient`, not the broader cash-capable workforce type.
- Cash payments, advances, opening balances, repayments and corrections are excluded. No APIs, contracts, schemas, routes or UI controls for those operations are added.
- Monthly approval retains the existing Web Locks identity fence, version-1 storage key and record protocol, reload-only handling for foreign intents, no stale resurrection, scoped project-cost invalidation, and global search without cached legacy salary-payment entities.
- Generated `packages/contracts/dist` can retain removed exports after a cherry-pick. Rebuilt the local ignored output with `pnpm --filter @tuari/contracts build` through `heavy_run` after each backend integration; frontend references the narrowed source-generated exports only.

## Design context and limitations

`DESIGN.md` and the original develop components are the visual authority. The repository has no `PRODUCT.md`, and the impeccable `reference/product.md` file is absent from the installed skill directory. I did not invent product-reference material or redesign the pages. This lane makes no screenshot claim; parent owns final browser proof after integration.

## Applied wisdom

- `architecture/deepen-a-leaky-view-model-seam-by-hiding-the-dependency-graph-behind-one-purpose-shaped-operation`: keep exact-to-display mapping at the employee-list adapter instead of leaking salary parsing into the original table.
- `architecture/dialogs-snapshot-identity-not-derived-data-reset-a-mutation-s-terminal-state-per-draft`: exact monthly approval continues to scope recoverable intent to workspace/user identity and blocks stale retry.
- `testing/employee-creation-via-ui-is-impossible-on-develop`: exact create validates the worker's manager/project placement and tests must supply a valid manager and project.
- `testing/dashboard-stat-bands-never-claim-a-false-zero-for-loading-error-and-format-money-deterministically`: unavailable financial dashboard values remain unavailable, not zero.

Lesson candidates: none identified yet.
