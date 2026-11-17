# Production cache and empty-state corrections

Resolve the bounded integration review findings: warehouse assignment cache identity includes warehouseId; an empty exact employee list retains RecordPageFrame and one page heading. Regressions cover switching two warehouse records within one fresh QueryClient and the empty employee heading. Red logs are preserved locally.

Parent seam inspection also found the project cost component used a separate unscoped cache family. Give it the same workspace/user/project exact-workforce key used by the salary screen. Existing approval invalidation now refreshes either observer and operator scopes cannot share cached ledger output. Carry the authenticated scope through ProjectDetailsPage; missing exact-mode scope fails closed instead of falling back to numeric ProjectCostSection. A focused test covers fresh-cache reads, approval-family invalidation and operator switching.

The list Retry button refreshes only its active queries, including a failed project-assignment query. It does not force disabled unrelated queries to execute.

This is an affected-local correction, not licensing, schema or monetary-contract expansion. Browser writes, native acceptance and current-head hosted review remain unverified.
