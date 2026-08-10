# #230 — Auth: reject whitespace-only passwords in the shared credential schema

**Tier:** High-assurance (security — credential password policy)
**Base:** `origin/develop` @ `03ec349643901a2802338d8e19b730b28e5eb841`

## Problem

`packages/contracts/src/auth.ts` defines `password: z.string().min(8).max(128)` for both
`phonePasswordSignInSchema` and `authBootstrapInputSchema`. A whitespace-only password of
8+ characters (e.g. 8 spaces) passes the wire gate, gets hashed, and can become the first
admin's stored credential. Follow-up from #226 (debate critic finding).

## Design

### 1. Shared password schema (contracts)

Introduce one `passwordSchema` used by **both** schemas so sign-in and bootstrap stay
consistent (explicit issue requirement).

```ts
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  // #230: reject blank-looking passwords. NOT trimmed/normalized — passwords
  // are opaque secrets; the hash must be computed over exactly what the user
  // typed, and trimming would break existing hashes. Instead require at least
  // one visible character: anything that is not a control (Cc), format (Cf,
  // ZWSP/LRM/BOM), nonspacing mark (Mn: combining accents, variation
  // selectors), or separator (Z) codepoint. Internal spaces remain allowed
  // (NIST 800-63B). The length guard defers to .min(8) for EVERY too-short
  // value so a short+blank password (e.g. 6 spaces) yields a single "too
  // short" issue, not doubled too_small + custom issues (same pattern as the
  // name's refine).
  .refine(
    (value) => value.length < 8 || /[^\p{Cc}\p{Cf}\p{Mn}\p{Z}]/u.test(value),
    {
      message: "password must contain at least one visible character",
    },
  );
```

- `.refine()` (not `.regex()`) is deliberate: it emits a `custom` issue, which the
  bootstrap service's `bootstrapFieldErrorMessage` already routes through the
  `BOOTSTRAP_FIELD_CUSTOM_MESSAGE` record — the exact seam the service comment
  anticipated ("forces a decision here when a refine is added to another field").
  A `.regex()` would emit `invalid_string` → wrong Arabic copy ("must not exceed 128 chars").
- Rejection classes covered: spaces/tabs/NBSP/BOM (via \s members that are Z/Cf),
  ZWSP + LRM/RLM (Cf), control chars (Cc), combining marks + variation
  selectors (Mn). Internal spaces in a real password pass.

### 2. Bootstrap service copy (`apps/api/src/modules/auth/bootstrap.service.ts`)

Set `BOOTSTRAP_FIELD_CUSTOM_MESSAGE.password` to a dedicated Arabic message and update
the two comments that say "today only `name` carries a refine".

### 3. Web pre-validation (`apps/web/src/features/app-shell/home-view-auth-utils.ts`)

`mapCredentialErrors`: distinguish a `custom` password issue (blank-looking) from
too_short → show `copy.validation.passwordWhitespace` instead of `passwordShort`.
Empty password keeps the existing `password` (required) branch.

### 4. i18n copy

- `apps/web/src/i18n/resources/ar.ts`: add `auth.validation.passwordWhitespace`.
- `apps/web/src/features/app-shell/home-view-copy.ts`: add the key to the
  `validation` type + `buildHomeViewCopy` mapping.

### Out of scope (verified)

- **Settings change-password** (`workspace-mutations.ts`): already trims the new
  password, so a whitespace-only value becomes empty → "required" error. No change.
- **Password normalization/trimming**: explicitly rejected — would change hashing
  semantics and break existing users.
- **Server-side sign-in wire gate**: better-auth validates sign-in natively; the
  shared schema is the client gate (web + desktop both go through
  `use-phone-sign-in-mutation`'s `schema.parse`). Applying the rule to the shared
  schema covers both without touching better-auth internals.

## Tests

| Layer | File | Coverage |
|---|---|---|
| Unit (contracts) | `packages/contracts/src/index.test.ts` | whitespace-only (spaces/tabs/NBSP/ZWSP/Cc) rejected by both schemas; internal spaces accepted; empty → still "short" issue only |
| Unit (api) | `apps/api/src/modules/auth/bootstrap.service.test.ts` | whitespace-only rejected before hash/port; Arabic custom message for the new refine |
| Unit (web) | new `apps/web/src/features/app-shell/home-view-auth-utils.test.ts` | `mapCredentialErrors` shows the whitespace message, `passwordShort` for short, `password` for empty |
| E2E | `tests/e2e/bootstrap-setup-key.spec.ts` | wire-level: `authBootstrap` with a whitespace-only password → HTTP 400 `BAD_REQUEST` whose single issue is the `custom` refine on `password` (deterministic in fresh AND bootstrapped DB states — the schema gate fires before the conflict/unauthorized gates). Empirically the ORPC wire gate returns 400, not an envelope `VALIDATION` (that path is only reachable if the wire gate is bypassed — the service defense-in-depth returns it). |

## Risks

- **Existing whitespace-password users** would be unable to sign in via the app.
  Accepted per issue ("only new inputs are rejected"); hashes are unaffected and
  the app is greenfield (bootstrap creates the only first user).
- **Doubled zod issues on short+blank passwords** (e.g. 6 spaces would emit
  both `too_small` and `custom`) — mitigated by the length guard in the
  refine (defers to `.min(8)` for every too-short value, same pattern as the
  name refine).
- **`\p{...}` regex requires `u` flag** — verified syntax; vitest/node support it.

## Verification

- `pnpm --filter @tuari/contracts build && pnpm typecheck && pnpm lint`
- `pnpm test:api` (bootstrap service + router) and `pnpm test:web`
- `pnpm exec playwright test tests/e2e/bootstrap-setup-key.spec.ts`
