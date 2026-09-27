# #421 — code review evidence

**HEAD**: `ee779d6` (reviewed code; evidence pinned at `0c871c4`, a docs-only
wisdom commit on top) — base `183d222` = `origin/develop`
**Tier**: Standard
**Reviewer**: lane self-review (the crew brief overrides the skill's sub-agent
review pipeline; Greptile CLI is quota-blocked — see
`0c871c4-greptile-local.md`)

## Spec (does it match #421?)

| Acceptance | Status | Evidence |
| --- | --- | --- |
| Audit every wrapper for `return handler(...)` in `try` without `await` | Done | design table; only `mutationAudit`, `mutationAuditRateLimited`, `withAudit` take an `errorResolver` |
| Make the mapping apply to async handlers | Done | `return await handler(...)` in all three |
| Router-level test per affected wrapper | Done | 5 tests in `router.test.ts` (payment, invoice, `mutationAudit` failure output, `mutationAudit` ORPCError, `mutationAuditRateLimited` ORPCError) |
| Sync behaviour byte-for-byte identical | Done | `toFailureResult` still returns its envelope; no sync ORPCError-resolver caller exists |
| Expenses regression guard | Done | #419's `maps a domain error thrown by an async expense handler to its ORPC code` passes unchanged |

## Standards

- No `any`, no `@ts-ignore`; `settleResolvedError` is typed `unknown → unknown`.
- Smallest change: three `await`s + one 5-line helper; no restructuring.
- Comments explain the *why* (the return-vs-throw trap), not the *what*.
- Test helper changes are additive (`modules` override param), no existing
  caller changed except adding an empty `{}` for the new positional slot.
- `pnpm --filter @tuari/api typecheck` / `lint` / `check:unslop` green.

## Findings considered and disposition

1. **`return await handler(...)` alone is insufficient** — an ORPCError
   returned by a resolver fails output validation (`INTERNAL_SERVER_ERROR`).
   Fixed with `settleResolvedError`. Evidence: probe before/after.
2. **`toFailureResult` handlers must keep returning** — `settleResolvedError`
   only throws `ORPCError`, so the failure-envelope return path is untouched.
3. **Greptile P2: failure-output path lacked an async test** — added
   `returns the failure output for an async rejection through mutationAudit`.
4. **Greptile P2: stale `withMappedExpenseErrors` comment** — updated.
5. **Local `withMappedExpenseErrors` is now redundant with the shared fix** —
   kept deliberately per the brief ("assert it still does"); removing it is a
   possible follow-up on the #419 code, not required here.
