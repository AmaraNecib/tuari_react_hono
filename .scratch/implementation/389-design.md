# PR #389 review fixes — license enforcement on mutations

**Tier**: Standard (security-adjacent behavior change; local review + tests).

**Branch/worktree**: `feat/license-enforcement` @ `80d300c`, worktree `rev-389`.

**Base**: local `develop` @ `7c7c833` (`git merge-base develop HEAD`).

## Problem

PR #389 made `TUARI_LICENSE_STATUS` binding for audited RPC mutations, but the
Greptile 3/5 review found four gaps:

1. `grace` was treated as fully writable, not read-only.
2. Two non-RPC HTTP mutation routes (`POST /api/auth/profile`,
   `POST /api/inventory/invoice-groups/:id/attachments`) bypass the wrappers.
3. `getLicenseInfo()` cast the env value, and the guard's `default` allowed any
   unrecognised status — failures opened instead of closing.
4. The wrapper-level license pre-check ran before authentication, leaking the
   license state to anonymous callers.

Policy (from the lane brief): the post-install `trial` stays fully writable;
the post-expiry `grace` window is **read-only**.

## Decision

Single source of truth for license policy in `apps/api/src/infrastructure/license.ts`:

- `LICENSE_STATUSES` tuple + `LicenseStatus` union is the known set.
- `getLicenseInfo()` validates `TUARI_LICENSE_STATUS`: an unrecognised (or empty)
  value becomes `"unknown"`; absent keeps the historic `"trial"` default so a
  dev/test process still boots.
- `mutationLicenseRefusalMessage(status)` returns `null` for `active`/`trial`,
  the read-only message for `grace`, and an actionable message for every other
  status (with a defensive `default` so an out-of-band value fails closed).
- `readLicenseRefusalMessage(status)` is the read-side variant that also allows
  `grace`.

Consumers:

- `rpc-middleware.ts`: `requireWritableLicense` (mutations) and
  `requireUsableLicense` (edition/feature read gates). The audit-context
  creators authenticate first, then gate, so the error precedence is
  auth → license. The redundant pre-auth wrapper checks were removed.
- `create-app.ts`: attachment upload gates after its session + bootstrap-owner
  auth; returns `403 { success:false, error:{ code:"UPGRADE_REQUIRED", message } }`.
- `account.service.ts` (`updateCurrentProfile`): gates after
  `getCurrentSessionUser`, throws `AccountServiceError(message, 403)`; the
  profile route maps 403.

## Tests

- `license.test.ts`: unrecognised/empty status → `unknown`; refusal-message
  policy for mutation vs read gates.
- `rpc-middleware.test.ts`: grace refused with the read-only message; typo
  status refused; auth → license precedence for `mutationAudit` and `withAudit`.
- `account.service.test.ts`: locked and grace profile updates refused (403, no
  transaction), anonymous caller gets 401 first, trial still writes.
- `create-app.test.ts`: attachment route refused (locked and grace), auth-first
  precedence, profile 403 mapping.

## Risks / notes

- `change-password` is intentionally not gated (it is an auth operation, not a
  business write, and is outside the named findings).
- `/api/auth/profile` input validation still runs before session resolution
  (pre-existing behavior); the license gate is after auth regardless.
