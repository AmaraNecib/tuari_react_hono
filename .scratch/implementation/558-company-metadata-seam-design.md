# Company metadata seam

- Base and tree: `e46e37dfc161ca00cf710b38365f0d2bb49e45c5`; isolated T3 worktree `D:/worktrees/tuari_react_hono/t3-268a968b-5c4416a46b52fee7`.
- Scope: add a constructible nonfinancial metadata facade and extract counterparty CRUD from `FinanceService`; no composition-root, RPC, contract, schema or report changes.
- Verification: `focused-local / CI-final-pending`; high-assurance because mutation authorization and transaction/audit behavior are reachable. Fresh exact startup only; no legacy database/history assumptions.
- Vocabulary: organizations comprise workforce, operations, audit metadata and external counterparties. Numeric finance remains owned by `FinanceService`; counterparty metadata is nonfinancial and uses its own service.
- Interfaces: `CompanyMetadataService` accepts existing `WorkforceService`, `OperationsService`, `AuditService` and `CounterpartyService`; the latter requires only counterparties list/get/create persistence and `WorkspaceMutationContext`.
- Deletion test: construct/use metadata facade with no `FinanceService`; metadata must omit debt accounts, debt entries and salary payments. Counterparty mutation must retain the workspace authorization and transaction/audit path.
- Architecture: moved the counterparty seam out of finance; reused existing workforce/operations/audit domain implementations. Full retained-root method inventory remains parent-owned.
