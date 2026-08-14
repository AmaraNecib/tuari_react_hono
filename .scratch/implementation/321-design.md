# #321 — Auth: recovery path for users whose password predates the whitespace-only ban (#230)

**Tier:** High-assurance (auth — credential password policy)
**Base:** `origin/develop` @ `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2`
**Branch:** `feature/issue-321-legacy-password-recovery` (worktree started as `refactor/issue-321`; renamed per convention before push)

## Problem

#230 added a visible-character refine to the shared `passwordSchema` used by BOTH
`phonePasswordSignInSchema` and `authBootstrapInputSchema`. A user whose stored
hash was created (pre-#230) from an all-invisible password (e.g. 8 spaces) can no
longer sign in: the web client gates sign-in through the schema
(`use-phone-sign-in-mutation` parses before dispatch; `mapCredentialErrors`
blocks the form). The hash itself is untouched — only NEW inputs are rejected —
so the app offers no recovery path.

**Verified server behavior:** better-auth's phone-number sign-in route validates
`password: z.string()` only (no min/max/policy) and verifies against the stored
hash. The ONLY gate on the legacy hash is the web client's schema parse. The
desktop bridge (`desktop_sign_in_with_phone_number` in Rust Core) POSTs the raw
password to `/api/auth/sign-in/phone-number` with no additional validation, so it
is gated by the same client parse.

## Option analysis (from the issue)

1. **Admin-assisted password reset via desktop shell (Rust Core) — REJECTED.**
   The app is greenfield single-user: the only account IS the locked-out user, so
   there is no separate admin to assist. A "reset password without the old
   password" primitive is an account-takeover vector — even loopback-bound it is
   reachable by any local process and by any website the user visits (CSRF
   against localhost). The legacy hash is still verifiable and the user KNOWS
   their old password, so a reset that does not require it is strictly worse and
   expands the attack surface beyond the near-zero risk it mitigates.
2. **Re-enable OTP delivery (#283) — REJECTED.** #283 disabled it because no real
   delivery provider exists; the code comment requires adding one before OTP is
   enabled. An SMS/email provider is external-infra work (provider choice,
   credentials, delivery guarantees) disproportionate to a near-zero-impact case.
3. **Documented manual recovery (wipe/re-bootstrap DB) — ADOPTED as fallback
   documentation only.** Destroys all workspace data; kept as the last-resort
   note in the docs, not the primary path.

**PRIMARY: legacy sign-in acceptance.** Sign-in verifies an input against an
EXISTING hash; an all-invisible input can only succeed if the stored hash was
itself created from an all-invisible value (pre-#230). Lifting the client-side
sign-in gate restores the only non-destructive path that requires proof of
identity (knowledge of the old password), after which the user changes to a
compliant password in settings. #230's rule for NEW inputs stays fully intact:
bootstrap and change-password still enforce the visible-character policy.

## Design

### 1. Contracts — `packages/contracts/src/auth.ts`

Split the shared password schema along the creation/verification boundary:

- Keep `passwordSchema` (strict, visible-character refine) — used by
  `authBootstrapInputSchema` (credential creation) and exported for any
  create/change-password policy context. **#230 rule unchanged for new inputs.**
- Add `signInPasswordSchema = z.string().min(8).max(128)` — no visible-character
  refine. Explicitly documented: sign-in verifies against an existing hash, so an
  all-invisible input can only match a hash created before the #230 policy
  (the legacy recovery channel); length bounds still bound the wire.
- `phonePasswordSignInSchema` switches its password to `signInPasswordSchema`.
- Export `signInPasswordSchema` from `packages/contracts/src/index.ts`
  (`export * from "./auth"` already covers it once named).

### 2. Web sign-in gate — `apps/web/src/features/auth/use-phone-sign-in-mutation.ts`

No code change: it parses with `phonePasswordSignInSchema`, which is now
legacy-compatible. The parse still rejects malformed phones and out-of-bounds
lengths before dispatch.

### 3. Web form gates — `apps/web/src/features/app-shell/home-view-auth-utils.ts`

- `mapCredentialErrors` (sign-in): uses `phonePasswordSignInSchema` — now
  lenient, so an 8+ char all-invisible password produces NO error and the form
  submits (recovery path). Empty → `required`; <8 chars → `passwordShort`
  (unchanged behavior for those cases).
- `mapBootstrapErrors`: currently delegates password validation to
  `mapCredentialErrors` (now lenient) — that would silently let the bootstrap
  form show no client-side error for a whitespace password while the server wire
  gate rejects it. Fix: after the delegation, re-validate the password against
  the STRICT `authBootstrapInputSchema` result (already computed for the name
  field) and overwrite `errors.password` with `passwordWhitespace` /
  `passwordShort` when the strict schema finds a password issue. Bootstrap's
  client-side UX is unchanged.

### 4. Docs

Add an operations note documenting the supported recovery path:
- Primary: sign in with the legacy (all-invisible) password, then change it in
  Settings → account.
- Last resort: wipe/re-bootstrap the workspace DB (delete
  `apps/api/data/*.sqlite*` while the app is stopped, restart, re-bootstrap).

Where: a short section in `docs/desktop-auth-boundary.md` (auth boundary doc) or
a new `docs/operations/recovery.md` — decide during implementation based on the
existing doc structure.

## Tests

### Unit — contracts (`packages/contracts/src/index.test.ts`)
- Rework the `blankPasswords` matrix pins:
  - sign-in schema ACCEPTS each all-invisible class (legacy verification),
  - bootstrap schema STILL REJECTS each class (#230 intact for new inputs).
- Keep/adjust length-guard pins on the strict schema: 6-space → single
  `too_small`; 129-space → single `too_big` (add bootstrap analogs since the
  sign-in schema no longer carries the refine).
- Keep: internal spaces accepted; padded password round-trips untrimmed;
  diacritics/Arabic accepted; max-length accepted.

### Unit — web (`apps/web/src/features/app-shell/home-view-auth-utils.test.ts`)
- `mapCredentialErrors`: 8-space and ZWSP-only passwords → NO password error
  (was `passwordWhitespace`); short → `passwordShort`; empty → `required`.
- `mapBootstrapErrors`: 8-space password → still `passwordWhitespace`.

### Unit — web mutation (`apps/web/src/features/auth/use-phone-sign-in-mutation.test.tsx`)
- Add: an 8-space password IS dispatched to the auth client (recovery path);
  malformed payloads are still rejected before dispatch.

### Integration — API (`apps/api/src/infrastructure/auth/auth.test.ts`)
- Add: "server sign-in verifies a legacy whitespace-password hash" — real
  in-memory deps; compute `hashPassword("        ")` (better-auth/crypto,
  default scrypt params — the same `verifyPassword` the auth instance uses);
  insert `user` + `account` (providerId `credential`) rows; call
  `deps.auth.api.signInPhoneNumber` with the whitespace password → session
  issued. Wrong whitespace password → rejected. This pins that the server side
  of the recovery path (hash verification) works and stays hash-only.

### E2E — Playwright (`tests/e2e/legacy-password-recovery.spec.ts` + seed helper)
- New db-seed helper `seedLegacyPasswordUser`: computes a real better-auth
  scrypt hash for the legacy password (loaded from the pnpm virtual store via
  the existing `createRequire` pattern) and inserts `user` + `account` rows into
  the E2E sqlite DB (flips `hasUsers` → sign-in screen).
- Spec flow:
  1. Goto `/` → sign-in screen (user exists) → sign in with the legacy
     whitespace password → workspace shell renders (proves the client gate is
     lifted AND the hash verifies).
  2. Settings → change password (current = legacy whitespace, new = compliant),
     gated on the `/api/auth/change-password` response (per testing wisdom).
  3. Sign out → sign in with the new password → shell renders.
  4. Sign out → sign in with the OLD whitespace password → error toast (hash
     replaced).

## Risks / notes

- **"Weakening #230"?** Only the sign-in (verification) path is relaxed; no new
  all-invisible hash can be created (bootstrap + change-password stay strict).
  Documented in the schema comment so a future reader sees the intent.
- **E2E seeding fidelity:** the seeded hash must use the same scrypt parameters
  (N=16384, r=16, p=1, dkLen=64, `salt:hex` format, NFKC normalization) as the
  auth instance; use better-auth's own `hashPassword` from the pnpm store to
  avoid drift.
- **Bootstrap UX:** keep `passwordWhitespace` client-side message in bootstrap
  (strict re-check); the wire gate already rejects whitespace bootstrap inputs.
- **Port squatters / orphaned servers:** sibling worktrees may hold ports
  4318/3000 — check owners before local e2e runs (wisdom).
