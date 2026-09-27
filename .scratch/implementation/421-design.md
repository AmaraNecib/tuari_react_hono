# Issue #421 — `rpc-middleware`: async rejections never reach the error resolver

**Issue**: #421
**Branch**: `fix/421-withaudit-async`
**Worktree**: `worktrees/fix-withaudit-async`
**Base**: `origin/develop` @ `183d222` (the lane was cut from `c5334cc`; PR #419
merged into `origin/develop` while this lane ran, so the branch was rebased onto
`183d222` to pick up the expenses module and its regression guard)
**Review tier**: Standard

## Problem

`createRpcMiddleware`'s audit wrappers ran the handler inside a `try/catch` and
`return`ed its promise without `await`. A rejected promise therefore escaped the
`catch`, so `errorResolver` never ran for any `async` handler. Payment and
invoice handlers pass `async` functions and rely on that resolver to turn a
domain error (`PaymentNotFoundError`, `InvoiceNotFoundError`, …) into the
documented wire code.

## Audit of every wrapper in `apps/api/src/rpc/rpc-middleware.ts`

| Wrapper | Shape | Affected? | Why |
| --- | --- | --- | --- |
| `rateLimit` | no handler | No | no handler to run |
| `queryAuth` | `return handler(...)` in `async`, no `try` | No | no `try/catch`, so no mapping/logging is skipped |
| `mutationAudit` | `return handler(...)` inside `try`, no `await` | **Yes** | `errorResolver` skipped for async handlers |
| `queryAuthRateLimited` | `return handler(...)`, no `try` | No | no mapping to skip |
| `mutationAuditRateLimited` | `return handler(...)` inside `try`, no `await` | **Yes** | same bug |
| `withAuth` | `return handler(...)`, no `try` | No | no mapping to skip |
| `withAudit` | `return handler(...)` inside `try`, no `await` | **Yes** | the #421 bug; payment/invoice path |
| `withPermission` | `return handler(...)`, no `try` | No | gate only; delegates to inner wrapper |
| `requireEdition` | `return handler(...)`, no `try` | No | gate only |
| `requireFeature` | `return handler(...)`, no `try` | No | gate only |

Only the three wrappers that take an `errorResolver` are affected. The other
seven share the "`return handler(...)` without `await`" shape but have no
`try/catch`, so a rejection propagating through them is the correct behaviour
(their own guards throw before the handler runs).

## Second-order finding (not in the issue)

`return await handler(...)` alone is **not** enough. The payment/invoice
resolvers *return* an `ORPCError` rather than throwing it, and the wrapper
`return`ed that value as procedure output. ORPC then ran output validation
against `{ success: boolean }`, which failed and produced
`INTERNAL_SERVER_ERROR: Output validation failed`. Proven with a probe before
the fix (client rejected with the raw `DomainError`) and after
(`INTERNAL_SERVER_ERROR`), then again after `settleResolvedError`
(`NOT_FOUND`).

The middleware now distinguishes the two resolver contracts:

- an `ORPCError` is **thrown** (payment/invoice: `NOT_FOUND`, `CONFLICT`, …);
- any other value is **returned** as the output (the `toFailureResult`
  resolvers used by finance/operations/inventory/workforce return a
  `{ success: false, error }` envelope that their discriminated-union output
  schema accepts).

Synchronous behaviour is unchanged in practice: `toFailureResult` still
returns its envelope, and no production procedure pairs a *synchronous*
handler with an `ORPCError` resolver (all payment/invoice handlers are
`async`), so the only observable change is the async path this issue fixes.

## Change

`apps/api/src/rpc/rpc-middleware.ts`

- `mutationAudit`, `mutationAuditRateLimited`, `withAudit`: `return await
  handler(...)` so an async rejection settles inside the `catch`.
- new module-local `settleResolvedError(resolved)`: throw an `ORPCError`,
  return anything else.
- the three `catch` blocks call `settleResolvedError(errorResolver(error))`.

## Tests (router level)

`apps/api/src/rpc/router.test.ts`

- payment: real `createPaymentModule` over the in-memory repo; a
  `paymentsDelete` of a missing id rejects with `NOT_FOUND` (through
  `withPermission` → `withAudit`).
- invoice: real `InvoiceModule` over the in-memory repo; a `invoicesDelete` of
  a missing id rejects with `NOT_FOUND`.
- `mutationAudit` production path: an async-rejecting `financeService`
  (`CompanyError`) makes `debtAccountsCreate` resolve with the
  `{ success: false, error }` envelope — the `toFailureResult` return path.
- `mutationAudit` / `mutationAuditRateLimited` ORPCError path: a minimal real
  ORPC router over `paymentContract` proves an async rejection throws the
  resolver's `ORPCError`. These two wrappers have no production procedure
  paired with an ORPCError resolver, so the app router cannot exercise it.
- Regression guard: the expenses handler test added by #419
  (`maps a domain error thrown by an async expense handler to its ORPC code`)
  still passes unchanged. That handler maps locally via
  `withMappedExpenseErrors`; the shared fix does not disturb it.

All five new #421 tests fail against the un-fixed middleware (raw
`PaymentNotFoundError` / `DomainError` / `CompanyError` escapes) and pass
after the fix.

## Verification

See `.scratch/reviews/421/` for the raw evidence and the final SHA.
