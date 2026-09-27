# #421 — test audit evidence

**HEAD**: `ee779d6`
**Scope**: `apps/api/src/rpc/router.test.ts` (5 new tests), plus the #419
expenses regression test.

## Discrimination (the tests fail on the un-fixed code)

Swapping in `183d222`'s `rpc-middleware.ts` and running the five `#421` tests:

```
× maps a missing payment delete to NOT_FOUND through withAudit (#421)
× maps a missing invoice delete to NOT_FOUND through withAudit (#421)
× returns the failure output for an async rejection through mutationAudit (#421)
× mutationAudit maps an async rejection to the resolver's code
× mutationAuditRateLimited maps an async rejection to the resolver's code
Tests  5 failed | 37 skipped
```

On the fixed code all 5 pass. The raw error (not the mapped code) is the
received value, so the tests pin the mapping, not incidental behaviour.

## Coverage of the two resolver contracts

- ORPCError → thrown: payment/invoice (`withAudit`) and the two minimal-router
  tests (`mutationAudit`, `mutationAuditRateLimited`).
- failure output → returned: `debtAccountsCreate` via an async-rejecting
  `financeService`, asserting the exact `{ success: false, error }` envelope.

## Edge cases

- Missing id (not "wrong id"): `PaymentNotFoundError` / `InvoiceNotFoundError`
  carry the id in the message, so the assertion pins the message too.
- `mutationAuditRateLimited` also charges the rate limiter; the test uses a
  fresh middleware, so the budget cannot mask the mapping.
- The `toFailureResult` test asserts `fieldErrors: []` (the schema default),
  so a dropped field would fail.

## Gaps (honest)

- The minimal-router tests are synthetic routers over `paymentContract`; no
  production procedure pairs `mutationAudit`/`mutationAuditRateLimited` with an
  ORPCError resolver, so this is the only way to exercise that wrapper path.
- No test covers a resolver that returns a *non-ORPCError* `Error`; none of the
  production resolvers do that (they either return an envelope or throw).
