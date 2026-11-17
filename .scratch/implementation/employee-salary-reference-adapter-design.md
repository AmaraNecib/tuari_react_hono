# Employee salary-reference adapter

- Base: `fa061534141a9588a5be0104f302aaca731ddde6`
- Worktree: `D:/worktrees/tuari_react_hono/t3-13e85342-fb86a4d92dceec1e`
- Review tier: high-assurance. The changed path carries exact employee salary references and validation fields.
- Verification mode: focused-local / CI-final-pending.

The adapter accepts the contract's `salaryReference: { period, amount: string } | null` shape. It does not convert the exact decimal string to a number or derive a payroll liability from it. Save relationship fields remain optional; omission leaves server relationships unchanged.

`AppMutationError` is the form-facing adapter. It routes its structured field errors through `translateRpcValidationIssues`, which translates only registered workforce identifiers and returns the original dotted field path. Unknown messages remain literal. Other mutation results, query invalidation, account scoping, and optimistic-update behavior stay unchanged.

The test seam is the public mutation hook and its RPC client call, plus the structured `AppMutationError.fieldErrors` result. One focused test proves batch-create and atomic-save payloads; another proves salary-key translation, path retention and literal-message preservation.

The obsolete numeric salary-payment export remains for existing callers and is marked deprecated and non-authoritative. It still invokes the RPC that the backend deliberately refuses. Caller integration is outside this change.

Architecture: adapter behavior stays local; no query/cache seam moved. No matching employee-mutation or salary-reference wisdom lesson was found.
