# #214 — Thin the transport seam; move policy back into owning modules

**Tier:** High-assurance (change-password audit + origin-blocking security
middleware are security-sensitive — Standard lifecycle + debate per the tier
table in `docs/engineering-workflow.md`).
**Mode:** local-only (GitHub repository unavailable; no `gh`, no push, no PR,
no merge — parent owns remote operations).
**Base:** `origin/develop` @ `6be34976954dee8b6ef33a34ce923d348270cdb0`
(HEAD == base; branch `refactor/issue-214-transport-seam` is clean).
**Parent/map:** #211 (architecture-review deepenings map — #214, #216, #217).
**Ledger:** `docs/local-issue-status.md` row 214 — "No issue-specific local
evidence"; implemented from the lane brief + current source.

## Goal

Thin `apps/api/src/app/create-app.ts` (the transport layer) by moving three
policy concerns back into their owning modules, without changing observable
behavior:

1. **Invoice-attachment limits → owned by the inventory module.** Remove the
   duplicated constants + checks from `create-app.ts`; the
   `InventoryService.addInvoiceAttachments` already enforces them.
2. **Change-password audit → owned by the account module.** Move the actor
   resolution + audit-write policy (try/catch, warn, skip semantics) out of
   the route into new `AccountService` methods.
3. **Origin policy → one collapsed middleware.** Three near-identical inline
   origin blocks (`/api/auth/*`, `/rpc/*`, `/api/inventory/*`) collapse to one
   `createOriginBlockingMiddleware` factory in `src/middleware/`.

## Verified context (source of truth, not the old issue body)

### 1. Attachment limits duplication

`create-app.ts` (lines ~112-113, ~283-294) defines
`MAX_INVOICE_ATTACHMENT_COUNT = 10` and `MAX_INVOICE_ATTACHMENT_TOTAL_SIZE = 25MB`
and validates before calling the service. `inventory.service.ts` (lines
117-119) already owns the authoritative limits and enforces them first thing
in `addInvoiceAttachments`:

- count > 10 → `InventoryError("VALIDATION", "عدد الملفات المرفوعة كبير جدًا.")`
  with field message `الحد الأقصى هو 10 ملفات لكل فاتورة.` — **identical**
  message to the route copy (both interpolate the same constant value 10).
- total > 15MB → `InventoryError("VALIDATION", "إجمالي حجم الملفات كبير جدًا.")`
  with `يرجى تقليل إجمالي حجم المرفقات قبل الرفع.` — **identical** message to
  the route copy (25MB). The service value (15MB) is the *stricter* one, so the
  outcome for every payload is the same rejection, from the service.

So the route-side duplicate is pure redundancy with an `import`-free drift
risk (25 vs 15). Removing it is behavior-preserving: over-limit requests still
get a 400 + `{ success: false, error }` via the existing `InventoryError`
mapping (`getAppErrorStatus`). The route keeps session + bootstrap-owner
authorization and the error mapping; the *limit* policy lives in inventory.

The service values stay as-is (10 files / 5MB per file / 15MB total) — no
policy change, only ownership consolidation.

### 2. Change-password audit placement

`create-app.ts` `POST /api/auth/change-password` (lines ~246-267) inlines the
audit flow: resolve actor via `getCurrentSessionUser` (try/catch → null) →
run `auth.handler` → on success `recordPasswordChangeForUser(actor)`, with two
`console.warn` fallbacks. `AccountService` already has
`recordPasswordChangeForUser(user)` (write) and `recordPasswordChange(headers)`
(throws on unauthenticated). The *policy* — resolve-or-null, warn-and-skip on
missing actor, warn-don't-break on write failure — lives in the route today.

**Ordering constraint (why actor is resolved BEFORE `auth.handler`):** a
successful better-auth `changePassword` may revoke/rotate the request's
session. The actor context (id/name/phone) must be read from the *request-time*
session, so the resolution must stay before the auth call. The new service
surface and the route keep that order.

New `AccountService` methods (behavior-preserving move of policy):

- `resolvePasswordChangeActor(headers): Promise<CurrentSessionUser | null>` —
  wraps `getCurrentSessionUser` in try/catch → `null` (never throws).
- `recordPasswordChangeAudit(actor: CurrentSessionUser | null): Promise<void>` —
  null actor → `console.warn` + skip; write failure → `console.warn` + swallow;
  success → `recordPasswordChangeForUser(actor)`.

Route becomes a thin delegation: resolve actor → `auth.handler` → pass through
on non-ok → `await recordPasswordChangeAudit(actor)` → pass through response.

### 3. Origin-blocking middleware duplication

Three inline blocks, byte-similar except the auth one's top-level safe-request
exemption:

- `/api/auth/*`: allow originless `GET`/`HEAD` (top-level navigation), else
  block when `isAllowedOrigin` is false.
- `/rpc/*`: block when not allowed.
- `/api/inventory/*`: block when not allowed.

All three respond `{ message: "Blocked origin." }` 403. The CORS
configuration and rate-limiter stay where they are; only the origin *block*
policy collapses into one factory. The auth prefix keeps its
`allowOriginlessSafelist` option so the top-level GET/HEAD exemption is
preserved exactly.

## Public API / interfaces

- `InventoryService` — unchanged. Limits remain private module constants.
- `AccountService` — adds `resolvePasswordChangeActor` and
  `recordPasswordChangeAudit`; existing methods unchanged.
- New `src/middleware/origin-blocking.ts`:
  `createOriginBlockingMiddleware(isAllowedOrigin, options?: { allowOriginlessSafelist?: boolean })`
  → Hono middleware (mirrors the `body-limit.ts` pattern).
- `createApp` — same signature; three route registrations use the factory.

## Planned tests (TDD at the owning-module boundaries)

- `apps/api/src/middleware/origin-blocking.test.ts` (new): factory blocks a
  disallowed origin; allows an allowed origin; `allowOriginlessSafelist`
  exempts only originless GET/HEAD, not other methods; default (no option)
  blocks an originless request.
- `apps/api/src/modules/inventory/inventory.service.test.ts` (new): focused
  `addInvoiceAttachments` tests pinning count >10 → VALIDATION error with the
  exact field message; total >15MB → VALIDATION with the exact field message;
  happy path persists via repository + storage (guards the moved-ownership
  seam against a future route-side re-add).
- `apps/api/src/modules/account/account.service.test.ts` (extend):
  `resolvePasswordChangeActor` returns the session user, and `null` when the
  session lookup throws; `recordPasswordChangeAudit` writes for a valid actor,
  warns+skips for null, warns+swallows when the write rejects.
- `apps/api/src/app/create-app.test.ts` (update + extend):
  - change-password tests switch their mocks to `resolvePasswordChangeActor` +
    `recordPasswordChangeAudit` and pin the delegation + ordering;
  - attachment route: mocked service rejecting with `InventoryError` maps to
    400 `{ success: false, error }` (transport pass-through, not re-check);
  - origin: existing RPC/auth origin tests stay green; add an inventory-prefix
    blocked-origin test covering the third collapsed registration.

## Dependencies

None added (`hono/factory` already used by `body-limit.ts`).

## Risks / notes

- Removing the route's 25MB total check means the service's 15MB total is the
  only enforcement point. Behavior preserved for every payload (rejection
  outcome + message identical), but the *boundary* moves: the parse of
  `c.req.formData()` in the route still happens before the service enforces.
  The global bodyLimit (30MB multipart) stays above both, and per-file 5MB +
  MIME checks remain service-owned.
- No coverage thresholds apply to `src/app/*` / `src/middleware/*` (not in the
  vitest coverage include), but the account-module tests must still exercise
  the new branches (module IS in the include list).
- Scope guard: transport-only concerns that are NOT duplicated (security
  headers, CORS, rate limiting, body limit, error mapping, RPC context) stay
  in `create-app.ts`.