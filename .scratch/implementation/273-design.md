# Issue #273 — Enforce secret strength + protect secrets at rest

**Tier:** HIGH-ASSURANCE (security)
**Base:** `develop` @ `256f24a34cf77ed527177ee640e74c1039028dbb` (merge-base with HEAD at design time)
**Branch:** `refactor/issue-273-secret-strength`

## Problem (verified on develop)

1. `BETTER_AUTH_SECRET` is only `z.string().min(1)` (`apps/api/src/config/index.ts`) — any
   single character passes; the repo ships guessable placeholders in `.env.example` and the
   old dev `.env`.
2. `BOOTSTRAP_SETUP_KEY` has no minimum length and is compared with `!==`
   (`apps/api/src/modules/auth/bootstrap.service.ts`) — a non-constant-time comparison.
3. The desktop shell persists `better-auth.secret` and `app-db.key` as plaintext,
   ACL-unprotected files under `<app_data>/runtime/secrets/` (`apps/desktop/src-tauri/src/lib.rs`).

## Fix design

### A. Shared secret-strength module (API) — NEW `apps/api/src/config/secret-strength.ts`

Pure, dependency-light (only `node:crypto` for the constant-time compare):

```ts
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;
export const BOOTSTRAP_SETUP_KEY_MIN_LENGTH = 20;
export const MIN_SECRET_ENTROPY_BITS_PER_CHAR = 4;

export function estimateSecretEntropyBits(secret: string): number;  // Shannon over observed alphabet
export function isStrongSecret(secret: string, minLength: number): boolean;
export function safeSecretEquals(a: string, b: string): boolean;    // SHA-256 + timingSafeEqual
```

- **Entropy gate:** estimated Shannon entropy **per character ≥ 4 bits**. This rejects the
  shipped placeholders (`tuari-dev-secret-at-least-32-characters` = 3.55 bpc,
  `replace-with-a-32-plus-char-secret` = 3.68 bpc) *naturally*, plus a small exact-match
  blocklist for the two known placeholders as defense-in-depth. Uniform hex (the desktop's
  generated shape) sits exactly at 4.0 bpc → passes. Base64/mixed-case secrets ≈ 5-6 bpc.
- **Why per-char, not a flat bit count:** scales with length; a 32-char secret needs ≥128
  bits, a 20-char setup key needs ≥80 bits — a single defensible rule.

### B. `apps/api/src/config/index.ts` — enforce strength in the schema + factory

- `betterAuthSecret`: `z.string().min(32).refine(isStrongSecret(…, 32))` in `appConfigSchema`
  (schema-level, so `createAppConfig` enforces it via `parse`, and the exported schema is
  hardened for any other caller).
- Factory keeps the "required" fast-fail (plain `Error`) and the schema does length+entropy.
- `bootstrapSetupKey`: production-only gate in the factory — `NODE_ENV === "production"`
  requires the key AND `isStrongSecret(key, 20)`. Dev mode stays optional/lenient.
  The schema itself stays permissive (it cannot be NODE_ENV-conditional).

### C. `apps/api/src/modules/auth/bootstrap.service.ts` — constant-time compare

Replace `data.setupSecret !== this.bootstrapSetupKey` with `safeSecretEquals` (SHA-256 both
sides, then `crypto.timingSafeEqual` over equal-length digests). Same public behavior, no
length/early-exit timing signal.

### D. Desktop secrets at rest — `apps/desktop/src-tauri/src/lib.rs`

Use the **already-present `keyring` crate** (used today for the desktop bearer token) to move
`better-auth.secret` and `app-db.key` into the OS credential store (DPAPI on Windows /
Keychain on macOS / Secret Service on Linux).

- `SecretStore` enum: `Keyring { service: "com.tuari.desktop.secrets" }` | `File { dir }`
  (owner-only plaintext fallback only when the OS store is unavailable).
- `load_or_create_secret(store, account, byte_len, fallback_dir)`:
  1. keyring read → validated secret reused (legacy file best-effort deleted).
  2. keyring miss → **migrate** legacy plaintext file into the store, then delete the file.
  3. regenerate + persist to the store; if the store write fails → file fallback.
- Keyring read errors (headless Linux, locked keychain) → plaintext fallback under
  `secrets/` with **0700 dir / 0600 files** (Unix) so the app still starts; Windows/macOS
  stay OS-protected (keyring effectively always available there).
- Accounts mirror the legacy file names (`better-auth.secret`, `app-db.key`) so migration is
  an identity mapping and per-user semantics match the current `%APPDATA%`-based files.

No `Cargo.toml` change (keyring already a dependency).

### E. Env examples + E2E wiring

- `apps/api/.env.example`: keep the (now-rejected) placeholder but add an explicit comment
  that it must be replaced (rejected at startup) + `openssl rand -hex 32` generation hint.
- `tests/e2e/playwright.config.ts`: add a strong `BOOTSTRAP_SETUP_KEY` to `sharedEnv`
  (the existing `BETTER_AUTH_SECRET` already passes the new gate).
- `tests/e2e/helpers/session.ts` + `foundation-smoke.spec.ts` + `admin-account.spec.ts`:
  fill the setup-secret field when visible so the global setup key doesn't break the
  existing bootstrap flows.
- NEW `tests/e2e/bootstrap-setup-key.spec.ts`: order-independent wire test — wrong setup
  key → `UNAUTHORIZED` + Arabic message; configured key → created-or-conflict (proves the
  gate passes). Exercises the same endpoint the UI calls.

### F. Docs alignment

`docs/rust-core-architecture.md` (state-files table + keyring row) updated to reflect OS
credential storage instead of plaintext secret files.

## Owned paths (announced to supervisor)

- `apps/api/src/config/secret-strength.ts` (new)
- `apps/api/src/config/index.ts`
- `apps/api/src/config/config.test.ts`, `apps/api/src/config/database.test.ts`
- `apps/api/src/app/dependencies.test.ts`
- `apps/api/src/modules/auth/bootstrap.service.ts` + `bootstrap.service.test.ts`
- `apps/api/.env.example`
- `apps/desktop/src-tauri/src/lib.rs` (secrets section only — lines ~1082-1141, tests ~1520+)
- `tests/e2e/playwright.config.ts`, `tests/e2e/helpers/session.ts`,
  `tests/e2e/foundation-smoke.spec.ts`, `tests/e2e/admin-account.spec.ts`,
  `tests/e2e/bootstrap-setup-key.spec.ts` (new)
- `docs/rust-core-architecture.md`
- `.scratch/implementation/273-design.md`, `.scratch/reviews/273/`

## Dependencies

- `node:crypto` (built-in) for `timingSafeEqual`/`createHash` — no new package.
- `keyring` (already in `apps/desktop/src-tauri/Cargo.toml`) — no new crate, no lockfile change.

## Planned tests

Unit (vitest, `apps/api`):
- `secret-strength.test.ts` (new): entropy math, ≥32/≥20 gates, placeholder rejection,
  uniform-hex acceptance, `safeSecretEquals` equality/inequality + digest-length safety.
- `config.test.ts`: strong secret accepted; 31-char rejected; low-entropy 32-char rejected;
  placeholder rejected; production setup key <20 or low-entropy rejected; existing suite
  fixtures upgraded to strong values.
- `bootstrap.service.test.ts`: correct key still accepted (incl. trimmed), wrong key still
  rejected, no-port-touch on failure — now via `safeSecretEquals`.
- `dependencies.test.ts`/`database.test.ts`: fixture secrets upgraded.

Rust (cargo, `apps/desktop/src-tauri`):
- File-store round-trip idempotence (adapted existing test).
- Migration: legacy file adopted into store then deleted.
- Corrupt stored secret regenerated.
- Store-write failure falls back to plaintext file.

Playwright E2E: `tests/e2e/bootstrap-setup-key.spec.ts` (above). Full suite must stay green
locally (all existing specs updated for the global setup key).

## Implementation risks

1. **Keyring unavailable in headless CI** → keyring errors are treated as "use file
   fallback", so Rust tests stay deterministic without a real keyring daemon (mirrors the
   sqlcipher wisdom: pin the wiring, not the real OS store). Real DPAPI/Keychain behavior is
   only verifiable on real desktops — documented residual risk.
2. **E2E ordering:** `admin-account.spec.ts` owns the fresh-DB UI bootstrap (sorts first).
   The new spec is written order-independent (wire-based; created-vs-conflict tolerated).
3. **Dev convenience:** a copied `.env.example` now fails to start until `BETTER_AUTH_SECRET`
   is a real random secret — intended (that is the issue's ask); comment explains generation.
4. **Portable layout:** secrets dir is already per-user (`app_data_dir()/runtime/secrets`),
   so per-user keyring accounts preserve today's semantics; no per-install namespace needed.
5. **Sibling worktrees:** #279 also edits `lib.rs` (command gating) — changes are confined to
   disjoint regions; merge conflicts (if any) resolved at merge time by the parent.

## Deferred

- #265: rekey persistence (separate ops-risk issue) — not touched here.
