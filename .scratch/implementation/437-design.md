# Query failure envelopes, issue 437

## Scope and risk

Worktree: `D:/worktrees/tuari_react_hono/t3-f42f8615-25fbfea7b9ef0d2b`.
Base: `16c3ec7c5f9ce8b5e6a6bd64c4347a0307a59e14`, current origin/develop at start.
Acceptance: https://github.com/AmaraNecib/tuari_react_hono/issues/437.
Verification mode: focused-local / CI-final-pending. The current protection read returned 404, Branch not protected. See docs/ci-final-activation.md. This blocks merge, not publication.
Review tier: deeper route, debate then test-audit then code-review in separate sessions. These queries expose inventory and finance results. Missing mapping leaks raw domain errors instead of the documented failure output.

## Interface and design

The agreed test seam is the real RPC router, as requested by the issue. An entity result permits a failure envelope. A list result does not. Preserve existing contracts, authentication, permissions, successful outputs and unexpected-error rejection. Use existing module resolvers rather than creating another abstraction.

The employee query uses permission-scoped withAuth rather than admin-only queryAuth. Keep that wrapper and resolve only the awaited service call inside it. Switching wrappers would change who may read an employee.

Domain vocabulary remains unchanged. No money calculations, debt directions, stock writes, schema or UI changes. The patch is reversible through a normal revert with no data migration.
Architecture: no seam moved. Existing middleware centralizes asynchronous settlement; domain resolvers own known error recognition. Removing that middleware would duplicate settlement in handlers. This patch adds no module or adapter.

## Audit disposition

Changed registrations and their existing resolvers:

- Inventory: inventoryInvoiceGroupsGet, inventoryLocationContentsGet, inventoryAssetsGet and inventoryItemDefinitionsGet use toInventoryFailureResult.
- Operations: projectsGet, warehousesGet, projectAssignmentsGet and warehouseAssignmentsGet use company toFailureResult.
- Finance: debtAccountsGet, debtPartyDetail and externalCounterpartiesGet use company toFailureResult.
- Workforce: rolesGet, managerAssignmentsGet and permission-scoped employeesGet use company toFailureResult.

Already mapped, unchanged: inventoryAssetChargeDefault, inventoryAssetChargesListByProject and projectCostGet. Reports use their existing ORPC error mapping. Exact inventory, invoice, debt and payroll routers already pass their resolvers. Session builds its result directly and has no domain service rejection to map.

Outputs without a failure branch remain unmapped:

- Inventory: inventoryInvoiceGroupsList, inventoryAssetChargesListByUnit, inventoryOutboundTransfersList, inventoryTransferHistoryList, inventoryItemDefinitionsList and inventoryItemDefinitionOptions.
- Operations: projectsList, warehousesList, projectAssignmentsList and warehouseAssignmentsList.
- Finance: debtAccountsList, debtEntriesList, debtsSummary and externalCounterpartiesList.
- Workforce: rolesList, employeesList, employeesListPaged, managerAssignmentsList, salaryPaymentsList, employeeEarningsList, employeeStateHistoryList, projectManagerOwnershipHistoryList and warehouseManagerOwnershipHistoryList. Existing invalid-cursor transport mapping is preserved.
- System and metadata: workspaceSnapshot, systemLogList, getRecoveryKeyPool, backupStatus, update metadata/history and financial metadata. Their structured/list outputs are not entity-result unions. Disabled legacy payroll and unavailable financial handlers deliberately throw their existing transport errors.

## Proof and boundaries

Each changed handler has a router-level asynchronous NOT_FOUND rejection test with an independent literal expected envelope and a spy-call check. Each also has an unexpected-error identity test. Existing router cases cover successful reads and access restrictions. The 14 new domain cases failed on the original handlers with raw CompanyError or InventoryError rejections, then passed after mapping. The router file now passes all 82 cases.

Setup attempts are preserved under .scratch/reviews/437. Initial execution could not find Vitest; frozen-lockfile installation restored existing dependencies. The next attempt could not load contracts because generated dist was absent. Contracts compilation was required solely to execute API tests, and used heavy_run. No dependencies were added. API typecheck and changed-file ESLint pass. Full checks remain CI-final.

Apply the matching wisdom lesson about async settlement and ORPCError versus failure outputs. No middleware change is necessary. No new repeated lesson was established.

Changed-file manifest: four handler files, apps/api/src/rpc/router.test.ts and this design note. No frontend file changed, so before/after UI evidence is not applicable.
