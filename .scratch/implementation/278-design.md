# Issue #278 — Attach zod issues to validation errors + align web error-handling

**Tier:** Standard (code change to API + web; no authz/security/crypto).
**Base SHA:** `03ec349` (`origin/develop` @ merge-base).

## Problem (verified, not assumed)

The issue audit points at `input-validator.ts:41,59` (the `VALIDATION` ORPCError
with message `"Invalid input: validation failed"` and **no** field data) and at
`apps/web/src/lib/rpc-error-handling.ts:5` (which special-cases the *different*
string `"Input validation failed"`). Investigation on this worktree confirms:

1. **The production validation path is the ORPC contract wire gate**, not the
   middleware. Every procedure is declared with `implement(appContract)` and the
   router mounts handlers with `os.<proc>.handler(...)` — no handler uses the
   middleware's manual validation. The wire gate rejects invalid input with:

   ```js
   new ORPCError("BAD_REQUEST", {
     message: "Input validation failed",
     data: { issues: result.issues },   // zod issues WITH field paths
   })
   ```

   Verified end-to-end via `createRouterClient` probe: the client-side error is
   an `Error` (ORPCError) with `message: "Input validation failed"` and
   `data.issues = [{ origin, code, path: ["name"], message: "Too small: ..." }, ...]`.
   The client (`createORPCErrorFromJson`) preserves `data` over the HTTP wire, so
   the web already receives the field paths.

2. **The `*Validated` middleware variants are dead code.** `queryAuthValidated`,
   `mutationAuditValidated`, `mutationAuditRateLimitedValidated` were added in
   `aa8b3f3` and **never invoked in any commit** (verified with `git log -S`).
   They duplicate the wire gate via `InputValidator.validate` and throw the
   divergent `VALIDATION` error the issue quotes. If anyone ever wired one, the
   web's special-case string (`"Input validation failed"`) would NOT match
   (`"Invalid input: validation failed"` ≠ `"Input validation failed"`), so the
   generic message would be shown and `data.issues` never read — the exact trap
   the issue describes.

3. **The web extraction is fragile by construction.** `extractRpcIssueMessage`
   returns `error.message` whenever it is non-empty and ≠ `"Input validation
   failed"`. That magic string is the *only* thing that routes to `data.issues`;
   it works today only because the wire gate happens to use that exact message.
   Any ORPC error carrying `data.issues` under a different message would have its
   issues ignored. The existing test suite already asserts the intended
   precedence ("should prioritize RPC message over error.message") — the code
   implements it backwards (message-first with one exception).

## Decision: drop the double validation (issue's Option B)

The contract wire gate is the single validation authority. Delete the dead
manual layer instead of "fixing" it (attaching issues to a code path nothing
calls would keep the trap alive).

### API changes

- `apps/api/src/rpc/rpc-middleware.ts`
  - Remove `queryAuthValidated`, `mutationAuditValidated`,
    `mutationAuditRateLimitedValidated` (dead, double validation).
  - Remove the local `ValidatorSchema` interface and the `InputValidator` import.
- Delete `apps/api/src/infrastructure/validation/input-validator.ts` and
  `input-validator.test.ts` — zero production consumers remain; the class's
  `validate`/`validateAsync` are exactly the divergent error throwers the issue
  cites (lines 41/59), and `safeValidate` is also unused. The wire gate's
  `data.issues` supersedes both (structured paths, not dot-joined strings).

### Web changes

- `apps/web/src/lib/rpc-error-handling.ts` — restructure `extractRpcIssueMessage`
  to prefer `data.issues` **first** (any non-empty issues array with a valid
  first message → that message), then fall back to `error.message` (still
  suppressing the generic `"Input validation failed"` when no issues are
  attached). Removes the magic-string dependence for the issues path; aligns the
  code with the already-pinned "issues beat message" precedence.

### Tests

- **API unit (router.test.ts):** pin the wire-gate error shape end-to-end through
  the untyped client: `code: "BAD_REQUEST"`, `message: "Input validation failed"`,
  `data.issues[0].path === ["name"]` with a non-empty message. (Regression pin —
  passes today, guards the shape against future divergence.)
- **Web unit (rpc-error-handling.test.ts):** add the real wire-gate ORPCError
  shape (Error instance + `data.issues`) and an issues-first-precedence case.
  Existing tests stay green (the "generic input validation failed → null" case
  is preserved: no issues → generic message suppressed).
- **Playwright E2E (tests/e2e/validation-toast.spec.ts, NEW):** bootstrap →
  inventory item definitions → create with a 161-char name (passes the client
  gates: non-empty name + unit) → the wire gate rejects with `max(160)` →
  assert the toast shows the zod message (contains `160`), NOT the fallback
  `"تعذر إنشاء تعريف العنصر."`. Gate the assertion on the RPC response like the
  repo's toast-assertion pattern (waitForResponse on the create RPC, assert
  status 400) to avoid stale-toast flakes.

### Docs

- `docs/REFACTORING_TASKS.md` — replace the stale "Verify input validation
  middleware / InputValidator applied to all handlers" checklist item with the
  current reality (contract wire gate validates; manual layer removed in #278).

## Risks

- **Message drift:** asserting the exact zod v4 message text in tests would break
  on zod upgrades; pin `path` + non-empty message, and for the E2E assert
  `contains("160")` (the max constraint), not the full sentence.
- **E2E fragility:** this repo's e2e suite is load-sensitive; run the full suite
  (workers:1) per the repo wisdom before pushing.
- **Behavior change (intended):** errors carrying both a message and `data.issues`
  now surface the issue message instead of the message. Only the wire gate
  attaches issues, so this is the validation path only.
