# Slice 543 normal exact workforce

## Authority and boundary

Issue #543 is the source of acceptance. The parent-owned `.scratch/implementation/543-root-architecture.md` resolves the normal-root decisions. This delivers the backend slice only. Employee UI integration, personal inspection, independent reviews, current-head hosted checks and merge remain open.

Local base: `40af1d8f7f48f508f4ce90b6c670fa0a36e46ad7`. The remote PR branch was updated separately to `079bdb1d24a66176a7866c96d9a7d0d42724b286`. This work does not merge, rebase or publish that remote ancestry.

Verification mode: `focused-local / CI-final-enforced`, as passed by the owner. Review tier: high assurance because this changes money, authentication, schema startup, native persistence and normal API composition.

## Runtime and interfaces

Normal `createAppDependencies()` opens the configured native database and calls `ensureExactNormalWorkspaceSchema` before creating Drizzle or auth. The initializer never invokes `ensureDatabaseSchema`, never converts a legacy file, and refuses a nonempty database without changing it. Reopening validates schema markers and required physical columns. Legacy startup refusal remains unchanged for isolated legacy tests.

The exact root uses one connection, one FIFO lock and one `ExactFinanceService`. It gives that finance instance to `ExactWorkforceService`; the employee and operations metadata readers share the same native handle and lock. `OperationsWorkforceReader` exposes only employee identity, role, status and active manager assignment. It does not manufacture a numeric employee salary.

`Slice543Contract` and `Slice543Client` are the UI handoff types. The twelve existing exact employee methods keep their top-level names. `/rpc/workforceExact` exposes only `approveMonthlyEarnings`, `listEmployeeEarnings` and `getProjectSalaryCost`. The normal router keeps auth, roles, projects, warehouses, assignment reads/writes and backup routes. `slice543Capabilities` reports which salary operations are available. Deferred numeric financial routes require an authenticated session and return `503 SERVICE_UNAVAILABLE` before any legacy adapter can run.

The schema contains exact employee/reference/history, earnings/segments, exact debt/receipt, auth, role, project, warehouse and assignment records. It omits salary cash, payment, advance, opening and correction lifecycle tables. Full invoice, payment, inventory-money, expense, report and aggregate project-cost families remain unavailable. Project labor cost comes from approved exact allocations only.

## Proof plan and result

The main seam is the normal Hono application built from `createAppDependencies`, with real bootstrap, phone sign-in, authenticated RPC, native storage and close/reopen. The exact schema tests cover fresh creation, idempotent reopen, physical drift refusal, later-lifecycle table exclusion and unchanged refusal of an existing legacy file. The root test covers plain and keyed SQLite files, exact employee references and history, roles, projects, employee placement, ordered A/B/A earnings, idempotent replay, explicit unallocated earnings, labor totals, invalid projects/days/reference values, authenticated refusal of deferred money routes, and a worker-backed backup reopened through normal startup.

Focused results on the current source tree:

- API: 8 files, 118 tests passed. Command: `pnpm --filter @tuari/api exec vitest run src/app/normal-exact-root.test.ts src/app/dependencies.test.ts src/infrastructure/database/exact-normal-workspace-schema.test.ts src/rpc/employee-exact-router.test.ts src/rpc/workforce-exact-router.test.ts src/modules/company/adapters/sqlite-exact-workforce.repository.test.ts src/modules/company/employee-exact.service.test.ts src/modules/company/operations.service-coverage.test.ts`. Native exit 0. Raw log: `.scratch/reviews/543/focused-api-4.log`.
- Root/schema delta after the full focused run: 2 files, 6 tests passed on plain/keyed startup, schema idempotence and legacy refusal. Native exit 0. Raw log: `.scratch/reviews/543/normal-root-final-1.log`.
- Contracts: 2 files, 4 tests passed. Command: `pnpm --filter @tuari/contracts exec vitest run src/slice543-contract.test.ts src/employee-exact-contract.test.ts`. Native exit 0. Raw log: `.scratch/reviews/543/focused-contracts-2.log`.
- API and contracts typechecks passed. Targeted API ESLint and contracts ESLint passed. Raw logs: `.scratch/reviews/543/api-typecheck-precommit.log`, `contracts-typecheck-precommit.log`, `api-eslint-precommit.log`, and `contracts-eslint-root-final.log`.

Expected-red/setup failure logs remain in the same directory. No full suite, full build, E2E or browser run was used as local proof. Independent reviews and hosted/current-head acceptance remain parent gates.

## Preserved work and hygiene

The six paused #544/#545 files remain byte-for-byte unchanged and unstaged. The three committed #427 issue drafts are untracked with only their exact paths ignored; their working copies remain byte-for-byte intact. No other planning or design file is ignored.

The later payroll lifecycle router and services remain in source but are not mounted by this runtime. #541 remains open. This handoff does not claim product acceptance or authorize publication.
