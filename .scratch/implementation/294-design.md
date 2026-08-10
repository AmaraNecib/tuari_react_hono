# Issue #294 — Web sign-in error is untranslated (raw better-auth message shown)

## Problem

The web sign-in path (`usePhoneSignInMutation`) calls the better-auth client directly
(`getAuthClient().signIn.phoneNumber`). On failure it throws `result.error` as-is and
`extractAuthErrorMessage` returns the raw English message ("Invalid phone number or
password") — the Arabic UI shows an English string in both the inline `authError` and
the error toast.

The translation mapping `translateAuthApiErrorMessage` (in `apps/web/src/lib/auth-api.ts`)
already exists for exactly this and is used by the desktop fetch path
(`signInDesktopWithPhoneNumber`) — but the web better-auth client path bypasses it.

## Fix (single display seam)

Translate at the **display seam**: wrap every message extracted by
`extractAuthErrorMessage` in `translateAuthApiErrorMessage` before returning it.

Why this seam instead of the throw site in the mutation:

- **All auth-error display paths already converge here**: the toast path
  (`usePhoneSignInMutation.onError`) and the inline path
  (`home-view-auth-controller.ts` `setAuthError(...)`) both call
  `extractAuthErrorMessage`. Fixing it here fixes both with one change.
- **Safe for already-translated messages**: `translateAuthApiErrorMessage` falls back
  to the original message when the key is not in the map, so the desktop path
  (which translates at the throw site) is idempotent — an Arabic message passes
  through unchanged.
- **The fallback branch is NOT translated**: `fallbackMessage` is i18n copy already
  and must not pass through the map.

`translateAuthApiErrorMessage` stays module-private; it is exercised through
`extractAuthErrorMessage`'s public surface.

## Files touched

| File | Change |
|------|--------|
| `apps/web/src/lib/auth-api.ts` | Wrap the 5 extracted-return sites of `extractAuthErrorMessage` with `translateAuthApiErrorMessage`; update doc comment |
| `apps/web/src/lib/auth-api.test.ts` | New `extractAuthErrorMessage` describe: translates known messages, idempotent on Arabic, unknown passthrough, fallback |
| `apps/web/src/features/auth/use-phone-sign-in-mutation.test.tsx` | New test: web better-auth error → toast shows the translated Arabic message (switch auth-api mock to `importActual` + override, spy `showErrorToast`) |
| `tests/e2e/admin-account.spec.ts` | Narrow the sign-in error assertion from the accepting regex to the Arabic form only (post-fix regression pin) |

## Tests

- **Unit (`pnpm test:web`)**: `extractAuthErrorMessage` mapping table
  (known message → Arabic; `{ message }` better-auth object shape; unknown →
  unchanged; Arabic → unchanged; unextractable → fallback; string shape).
- **Unit (mutation hook)**: web path with `{ data: null, error: { message: "Invalid
  phone number or password" } }` → `showErrorToast` called with
  `رقم الهاتف أو كلمة المرور غير صحيحة.`.
- **E2E (Playwright)**: existing `admin-account.spec.ts` "admin changes password"
  already covers the failed sign-in flow; narrowing its regex to the Arabic form
  makes it a regression pin for this issue. The #254 regex
  `/Invalid phone number or password|رقم الهاتف أو كلمة المرور غير صحيحة/` was
  deliberately accepting-both; post-fix only the Arabic form is produced.

## Risks

- **E2E green-ness**: the narrowed assertion depends on the fix; if the translation
  regresses, the E2E fails (that is the point). The desktop path is unaffected
  (idempotent translation).
- **`better-auth` error shape drift**: if `result.error` stops carrying `message`,
  `extractAuthErrorMessage` falls back to `statusText`/fallback — behavior degraded
  but never crashes. Covered by the object-shape unit test.
- **Scope creep**: no changes to sign-out, profile, or password-change flows — they
  already route through the same seam or translate at the throw site.

## Review tier

**Standard** (web UI/lib code). Base SHA: `03ec349` (origin/develop at start).
