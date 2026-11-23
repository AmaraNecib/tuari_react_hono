## ORPC swallows procedure errors before the request interceptor: the real message only exists at the client interceptor (🟠 Major)

On the invoice-observability lane the API had no usable failure log. The only
hook was `interceptors: [onError(...)]` on the `RPCHandler`, but ORPC's
`StandardHandler.handle` wraps the whole match/decode/call in a `try/catch`
that **encodes every procedure error into a response** (`codec.encodeError`)
and returns `{ matched: true, response }`. A request-level `onFinish`/`onError`
therefore sees either a resolved result or, for decode/encode failures, a
thrown error — never the original procedure error. Worse, `toORPCError` maps a
plain `Error` to `{ code: "INTERNAL_SERVER_ERROR", message: "Internal server
error" }`, so the wire body does not carry the real message either.

Two more traps found while wiring the logging:

1. The only layer that still holds the real error is the **procedure client**
   interceptor (`clientInterceptors: [onError(...)]`), whose options include
   `path` (the procedure name) and `context`. A domain failure returned as
   `{ success: false }` never throws at all, so it needs a **client-level
   `onFinish`** inspecting the decoded output.
2. The ORPC standard-protocol response body is wrapped as `{ json: <payload>,
   meta?: [...] }` — for **errors too**. A status/body logger that reads
   `response.message` finds nothing and falls back to `HTTP 500`; it must
   unwrap `body.json` first.

De-duplication between the client interceptor (has the error) and the
transport middleware (has the mapped status) needs an explicit per-request
marker, but **NOT keyed on the ORPC `context` object**: ORPC shallow-copies
the context between layers (`resolveFriendlyStandardHandleOptions` spreads,
`intercept` spreads again), so the client interceptor and the `/rpc/*`
middleware receive different object identities for one request — a
`WeakSet<object>` keyed on `context` silently misses and both layers log
(found empirically with a tag property that appeared on both copies). Use an
`AsyncLocalStorage` store created by the transport middleware and inherited by
every nested interceptor; that is identity-independent. Test the exact
contract: a rejected mutation logs **one** line with the error message, a
thrown procedure error logs one line with its real message, and a successful
mutation logs nothing.

3. Do not guess 400 vs 500 in the interceptor. ORPC already mapped the status
   (`step === "decode_input"` → `BAD_REQUEST`, otherwise
   `INTERNAL_SERVER_ERROR`), but only the transport sees the encoded response.
   Log the status verbatim from a `status >= 400` response in the `/rpc/*`
   middleware: a malformed request must not be reported as a server fault.

**Always**: when adding ORPC server-side logging, put thrown-error logging on
`clientInterceptors.onError`, `{ success: false }` logging on
`clientInterceptors.onFinish`, and decode/encode + 4xx/5xx logging at the
transport using ORPC's mapped status, deduped by an `AsyncLocalStorage` store
(never by the context object). Never assume a request-level `onError` sees
handler errors, and always unwrap `{ json: ... }` before reading a response
body.

