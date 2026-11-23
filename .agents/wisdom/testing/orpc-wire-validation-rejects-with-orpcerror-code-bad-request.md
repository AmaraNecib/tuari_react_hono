## ORPC wire validation rejects with ORPCError code BAD_REQUEST (🟡 Minor)

Probed on #206: calling an ORPC procedure (via `createRouterClient`) with input that fails the contract schema rejects with an `ORPCError`: `code: "BAD_REQUEST"`, message `"Input validation failed"` (the server maps the internal `ValidationError` to this). A handler-side `throw new Error(...)` surfaces differently (plain Error), so `rejects.toMatchObject({ code: "BAD_REQUEST" })` is the precise way to assert the *wire gate* fired, not a handler crash.

**Always**: in ORPC router tests, assert invalid-input rejections with `toMatchObject({ code: "BAD_REQUEST" })` rather than `toBeInstanceOf(Error)`.

