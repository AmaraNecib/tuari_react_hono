# #421 — Greptile CLI evidence

## Run 1 (clean checkout, HEAD `13667cb`, base `origin/develop` `183d222`)

`greptile review --json --branch origin/develop` → exit 0, confidence **4/5**,
2 findings (both P2, non-security):

1. `apps/api/src/rpc/router.test.ts` — "Failure outputs lack coverage": the new
   `mutationAudit`/`mutationAuditRateLimited` tests use an ORPCError resolver,
   but production callers use `toFailureResult` (returns a failure output).
   **Addressed**: new test
   `returns the failure output for an async rejection through mutationAudit`
   asserts the exact `{ success: false, error }` envelope from an
   async-rejecting `financeService`.
2. `apps/api/src/rpc/rpc-middleware.ts` (comment on `handlers/expenses.ts`) —
   "Expense explanation is outdated": the `withMappedExpenseErrors` doc still
   claimed `withAudit` does not await. **Addressed**: comment rewritten to
   describe the #421 shared fix and the wrapper's defense-in-depth role.

## Run 2 (HEAD `ee779d6`)

`greptile review --json --branch origin/develop` →
`error: you've used all 50 trial reviews for this account.`

The CLI cannot re-review. Treat Greptile as **unavailable** for the final HEAD
(per `.agents/wisdom/process.md`, "Greptile can stall / be quota-blocked").
The only Greptile verdict is on `13667cb`; both of its findings are fixed on
`ee779d6`, and the code change itself (the middleware) is identical between the
two commits (the delta is the added test, the comment fix, and the design doc).
