# Invoice create — diagnosability, disabled-reason, attachments (#11 + #10)

**Issue**: owner items 11 (invoice creation fails silently) and 10 (invoice attachments)
**Lane**: `fix-invoice-create` (worktree `worktrees/fix-invoice-create`)
**Branch**: `fix/invoice-create`
**Base**: `develop` @ `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36` (rebased; started from
`22495413`, then develop advanced with #441, which fixed the transfer-dialog test)
**Mode**: remote (parent owns push/PR; no merges from this lane)
**Tier**: Standard

## Problem

1. **No server-side failure trace.** `api-server.log` (the desktop shell's stdout/stderr
   capture for the sidecar) held exactly one line — the startup banner. The API only
   had a near-dead `onError` ORPC interceptor (`console.error("[oRPC error]", error)`);
   ORPC's request handler catches every procedure error and encodes it into a response
   before the interceptor sees it, and the common invoice-create rejection path
   (`toFailureResult` → `{ success: false, error }`) is a **200 response with no thrown
   error at all**. A user reporting "it didn't save" left nothing a human could read.
2. **The save control gave no reason.** `disabled={createMutation.isPending || lines.length === 0}`:
   deleting all lines dead-locked the button with no explanation, and an incomplete line
   only produced a message at the top of the page after a click.
3. **Attachment selection looked like a no-op.** `FileInput` rendered
   `props.multiple ? resolvedLabel : resolvedLabel` (a tautology) and never reflected the
   chosen files; the invoice page passed no `accept` and did no client-side check, so a
   PDF selection produced no visible change and a rejected upload surfaced only a generic
   toast that named neither the file nor the reason.

## Design

### API — one readable line per failed request

New `apps/api/src/infrastructure/observability/request-failure.ts` (uses the existing
`StructuredLogger`; never logs request bodies, query strings, or inputs):

- `logRequestFailure({ method, path, status, message, code?, error?, encodeFailed? })` →
  one `StructuredLogger.error("Request failed", …)` line with route, status, and message.
  `encodeFailed: true` is emitted only when the server failed to encode its own
  response; it is absent for every other failure, including a malformed request.
- `createRpcFailureStore` / `runWithRpcFailureStore` / `markFailureLogged()` /
  `isFailureLogged()` — an `AsyncLocalStorage` store created by the `/rpc/*` middleware, so
  exactly one layer logs a given failed RPC. It is NOT keyed on the ORPC `context`
  object: ORPC shallow-copies the context between layers, so the client interceptor and
  the transport middleware see different identities for one request (found empirically).
- `resolveFailureMessage` / `resolveFailureCode` / `unwrapResponseBody` read an
  already-decoded `{ json: … }` response body.

Wiring in `create-app.ts` (replaces the dead `console.error` interceptor):

- `clientInterceptors: [onError, onFinish]` — the only layer that still holds the real
  error (ORPC maps unknown errors to a generic 500 envelope): logs thrown procedure
  errors (real message + `options.path`) and `{ success: false }` outputs, and marks the
  store.
- request-level `interceptors: [onFinish]` — logs any `{ success: false }` envelope not
  already logged. Decode/encode failures (`isSuccess === false`) are left to the
  transport, where ORPC has already mapped the correct status.
- the `/rpc/*` Hono middleware — wraps `handle` in the store and logs a `status >= 400`
  response the client never logged, **using ORPC's mapped status verbatim**: 400 for a
  request it could not decode (the client's fault), 500 for a response it could not
  encode (the server's). No layer guesses 400 vs 500.
- `recordInterceptedFailure(error)` — the request interceptor classifies ORPC's raw
  error (the `cause` it attaches) and flags the store's `encodeFailed` for anything that
  is not a decode-class error (`SyntaxError`/`ORPCError`). An operator can do nothing
  about an encode failure, so it is called out explicitly in the log line.
- a first-registered global Hono middleware — logs non-RPC `status >= 400` from the
  response body, and rethrows unhandled errors after logging them. ORPC error envelopes
  on `/rpc/*` are skipped there (already handled above); the body-limit 413 (which
  bypasses ORPC) is still logged.

Norm: exactly one line for a rejected mutation, zero for a success.

### Web — the form says why, and attachments fail loudly

- Extract the existing per-line checks from `validateForm` into `validateLines(lines)`.
  The save button's disabled reason uses the same function, so the operator sees
  "اختر تعريف العنصر في السطر 1." / quantity / price / asset-name messages next to the
  button instead of only at the top after a click. No second message set is invented.
  `lines.length === 0` gets its own reason (`noLines`).
- `FileInput` mirrors the selected file names (`noFileChosen` → file name → `filesChosen`
  count) while still forwarding `onChange`; the invoice page passes the server's accepted
  MIME set as `accept`.
- New `invoice-attachment-rules.ts` mirrors the server's count/size/MIME limits and
  returns a localized message naming the offending file. Runs on selection and again
  before submit, so an invalid attachment never creates a half-saved invoice. Upload
  rejections surface the server's message (which already names the file) instead of a
  fixed generic toast. The create-first/upload-after/retry-only shape is unchanged.

## Tests

- `apps/api/src/app/create-app.test.ts`: a rejected mutation logs exactly one line
  containing the domain error message and the procedure; a successful mutation logs
  nothing; a non-RPC 4xx is logged once.
- `apps/web/src/features/inventory/inventory-invoice-create-page.test.tsx`: disabled
  reason for no lines and for an incomplete line; a rejected attachment names the file
  and the reason; a server upload rejection surfaces its message.
- `apps/web/src/components/ui/form-controls.test.tsx` (new): `FileInput` shows the chosen
  file name / count and forwards `onChange`.
- `tests/e2e/inventory-invoice-create.spec.ts`: disabled save reason plus a rejected
  `.txt` attachment named in the UI.

## Risks / boundaries

- `createMutation.isPending` still governs the in-flight disabled state; the reason is only
  shown when the control is disabled for a content reason.
- The `#42` bound tests must select a valid item definition first now that an incomplete
  line disables the button; their subject (paid-amount bounds) is unchanged.
- "Unhandled error" messages are taken from the client interceptor (the real error). A
  decode/encode failure is logged by the `/rpc/*` middleware with ORPC's mapped status:
  400 for a malformed request, 500 for a server-side encode/output failure.
