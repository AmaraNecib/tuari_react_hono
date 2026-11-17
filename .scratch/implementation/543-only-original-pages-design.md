# #543 original-page integration

## Revision and verification

- Worktree: `D:/worktrees/tuari_react_hono/t3-9f3476b8-76577619c9213797`
- Original implementation base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f`
- Correction base: `8160f6ee23bacb2d3db822be4f69166f4e43de25`. Parent integrated that frontend source as `3390809c`; this correction stays in the owned worktree.
- Reused source: `ec783452375bcf2c54523b830236eebb9e046738`
- Backend dependency: `00db1855021a84897a43f81fd8349f8b0eab5aaf`, plus correction `a39105cf2f2cb914c70f29ddc9e6399e4fdd6b56`; API/contracts paths were clean before both cherry-picks.
- Verification mode: `focused-local / CI-final-pending`
- Tier: high-assurance. Employee identity, exact salary references, and approved earnings affect money and durable recovery.
- Owner's requirement: "all page to have the original pages not the symplified version."

Issue #543 is the acceptance source. PR #541 and its source-owning tree remain untouched. This lane does not publish, add dependencies, change API/contracts, or widen scope to later payroll slices.

## Original-component map

| Route | Original component | Shared production JSX / extraction | Exact adapter |
|---|---|---|---|
| `/employees` | `EmployeeTable` inside `EmployeesSection` | `EmployeeTable`, `RecordPageFrame`, `AdvancedSearchBar`, original action group, delete and leave confirmation flows | `ExactEmployeeTable` maps paged exact profiles plus authenticated active manager/project/warehouse assignments into the original table row. Cursor, limit and previous-page history come from the validated route query; paging and search resets navigate through the existing route helper. The table fetches only the active project-manager reference list for manager names, not a redundant full employee list. End-work eligibility follows the server's role and relationship rules: unlinked active managers can leave, while active workers or managers with blocking links see the matching disabled reason. The workspace waits for reference reads and shows an error on failure rather than displaying false empty assignments. Numeric salary fields stay `null`; the retired payment dialog and action are disabled. |
| `/employees/create` | `EmployeeBatchCreatePage` and `EmployeeBatchRowCard` | `EmployeeBatchCreatePageView` shares the original heading, controls, limit notice, form and footer across numeric and exact adapters; both use the production `EmployeeBatchRowCard`. | `ExactEmployeeCreateForm` validates and serializes salary text with `SalaryReference` and exact-money parsers; it submits through `ExactEmployeeClient`. It does not call numeric salary APIs. If batch drafts remain when the caller switches to single-create mode, the original shared form keeps them visible and blocks submission with localized guidance until the operator removes extras. The handler enforces this even when a caller bypasses the submit control. |
| `/employees/:id/edit` | `EmployeeEditPage` | Pinned `EmployeeEditForm`, the original personal/work/salary sections, placement controls, managed-scope controls and footer actions | `ExactEmployeeEditPage` loads and saves exact employee records through an edit-only field helper. Creation stays in `ExactEmployeeCreateForm`. `salaryReference` remains a canonical string. |
| `/employees/:id` | `EmployeeDetailsPage` | `EmployeeDetailsView` owns the original `RecordPageFrame`, tabs, info cards, history table and navigation. Numeric and exact adapters provide display values and finance/debt panel slots. | Exact employee, state-history and assignment reads feed the shared view. Employee detail tabs follow the validated route query, and tab changes navigate through the existing route helper so direct links and remounts keep their selection. Exact references remain strings. The original debts tab shows the translated unavailable notice; it never mounts the legacy numeric debt query. The finance slot links to monthly approval and exposes no cash writes. |
| `/salaries` | Existing salaries workspace route | Existing monthly editor, production form controls, `Surface`, `PageHeader`, `MoneyValue` | `ExactSalaryEarningsSection` uses `ExactWorkforceEarningsClient`, explicit ordered segments, unallocated amounts, account-scoped recovery and exact readback. |
| `/projects` and `/warehouses` and their detail/create/edit routes | Original project and warehouse page components | `ProjectsSection`, `WarehousesSection`, original create/edit/detail forms, overview/history/team/item/transfer tabs and loading/error states | `ExactProjectWarehousePages` adapts authenticated application records. Project cost uses the narrowed exact earnings client. Exact capability mode keeps the original item/transfer tabs but renders the translated unavailable notice instead of mounting legacy inventory queries or controls. |
| `/` | `DashboardSection` inside the original signed-in shell | Original dashboard composition, labels, shell, sidebar and exact global-search flow | Exact application queries supply nonfinancial counts. Unsupported financial summary values stay unavailable rather than showing fabricated zeroes. |

The employee table keeps the original columns and displays active assignment labels from authenticated reference reads. Exact salary references appear in the shared employee record view and finance slot, not as a fabricated numeric column. Detail history combines exact salary-reference state changes with assignment history.

## Archive confirmation

Project and warehouse archive clicks now select a pending record and open the existing `RecordDeleteConfirmation`. Cancel closes the dialog without an update. Confirm sends one status update, reports failures in the page, and refreshes the exact workspace queries. `exact-project-warehouse-pages.test.tsx` covers both record types and makes unexpected RPC access fail loudly.

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

## Candidate 1 architecture delta

- Worktree: `D:/worktrees/tuari_react_hono/t3-62a39113-5ecfcfb5a840ae43`
- Base: `b22c94982b21af33a063f1a6ea5445d4bc450f3b`; verification mode: `focused-local / CI-final-pending`.
- Exact edit now owns one `FormState` draft and passes its React setter to the existing `EmployeeEditForm`. The draft keeps salary amount as the exact input string; exact parsing and wire serialization remain in the existing submit handler.
- Placement and managed-scope selections remain separate from the profile draft. Their exact adapter compares values against the supplied relationship snapshot; the numeric adapter keeps its dirty flags and stale-write protection.
- The shared form's three dirty callbacks are optional and invoked only when supplied. This removes exact-mode no-op obligations without masking the numeric adapter's actual callbacks.
- No JSX, routes, RPC contracts, money rules, transaction behavior or original controls changed. A focused edit assertion now checks that a large MONTHLY amount (`9007199254740993.21`) reaches exact save as an unchanged string; existing tests retain WEEKLY precision, DAILY precision, NULL-versus-zero, rejected-save draft retention and duplicate-submit coverage.
- Architecture outcome: the exact adapter's nine profile state values, object reconstruction and nine-setter fan-out disappear. This is a real adapter-local reduction; different numeric/exact validation, serialization and relationship concurrency policies remain separate by design.

## Applied wisdom

- `architecture/deepen-a-leaky-view-model-seam-by-hiding-the-dependency-graph-behind-one-purpose-shaped-operation`: keep exact-to-display mapping at the employee-list adapter instead of leaking salary parsing into the original table.
- `architecture/dialogs-snapshot-identity-not-derived-data-reset-a-mutation-s-terminal-state-per-draft`: exact monthly approval continues to scope recoverable intent to workspace/user identity and blocks stale retry.
- `testing/employee-creation-via-ui-is-impossible-on-develop`: exact create validates the worker's manager/project placement and tests must supply a valid manager and project.
- `testing/dashboard-stat-bands-never-claim-a-false-zero-for-loading-error-and-format-money-deterministically`: unavailable financial dashboard values remain unavailable, not zero.

Lesson candidates: none identified yet.

## #555 cleanup correction: workforce transport adapter

At base `61c9a5e75771cb0da0fc65cd5728540fc71f8c16`, `exact-workforce-client.ts` only wrapped `createORPCClient(createWorkspaceRpcLink(mount))`. Its only importers were `orpc-client.test.ts` and `exact-salary-earnings-section.test.tsx`; no production module imported it. Production uses the configured `applicationClient` singleton, and `WorkspaceShell` builds its narrow workforce facade from `client.workforceExact`. Remove the redundant wrapper. Keep transport validation, configured origin, authenticated browser/desktop dispatch and custom mount checks on `createWorkspaceRpcLink`; the salary proxy test now uses `applicationClient.workforceExact`. This is a narrow obsolete-module cleanup, not resolution of the full #555 diff.
