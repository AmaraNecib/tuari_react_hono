## An error resolver that RETURNS an ORPCError is not an error — the wrapper must THROW it (🟠 Major)

On #421 the audit wrappers (`mutationAudit`, `mutationAuditRateLimited`,
`withAudit`) ran `return handler(...)` inside a `try/catch` without `await`, so
an `async` handler's rejection escaped the `catch` and the `errorResolver`
never ran. Fixing the escape with `return await handler(...)` was necessary but
not sufficient: the payment/invoice resolvers *return* an `ORPCError`, and the
wrapper returned that object as the procedure OUTPUT. ORPC then validated it
against the output schema (`{ success: boolean }`), failed, and the client saw
`INTERNAL_SERVER_ERROR: Output validation failed` instead of `NOT_FOUND`. A
probe proved all three states (raw `DomainError` → output-validation 500 →
`NOT_FOUND`).

The middleware now distinguishes the two resolver contracts: throw an
`ORPCError`, return anything else (the `toFailureResult` resolvers return a
`{ success: false, error }` envelope their discriminated-union output accepts).
No production procedure pairs a synchronous handler with an ORPCError resolver,
so the change is observably async-only.

**Always**: when a `try/catch` wraps an async handler, `await` it inside the
try. And check what the catch *does* with the resolved error: `return`ing an
`Error`/`ORPCError` as a value makes it procedure output (output validation
will reject it); it must be `throw`n. Test at the router level — a helper-only
unit test cannot see ORPC's output validation turn the mapped error into a 500.

