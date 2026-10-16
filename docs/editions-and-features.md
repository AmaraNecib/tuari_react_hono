# Editions and features

What each Tuari license grants, derived from the code rather than from the
aspiration in `docs/licensing-architecture.md`. Every row cites the source it
came from as `path:line`. No prices and no marketing copy: capabilities only.

## How to read the status tags

The document's base is `develop` @ `2704c86`. The license-enforcement change
(`feat/license-enforcement`, PR #389) landed in `develop` at this base, so its
policy is shipped behavior. One change is still in flight:

| Tag | Meaning |
| --- | --- |
| `[shipped]` | Present in `develop` at this document's base. |
| `[in flight]` | Present on `feat/license-sellable-anchor` (PR #387); not yet in `develop`. |

The capability tables (editions, feature map, license types, seats) describe the
code on `develop`. Sections 4 and 6 no longer split enforcement into shipped and
in-flight columns: the refusal policy is shipped.

## 1. Editions

Three editions, ordered. `meetsMinEdition` compares rank, so a higher edition
satisfies every lower-edition minimum (`apps/api/src/infrastructure/license.ts:142`
and `:151`).

| Edition | Rank | Arabic label shown in the shell | Source |
| --- | --- | --- | --- |
| `standard` | 0 | قياسي | `packages/contracts/src/license.ts:18`, `apps/api/src/infrastructure/license.ts:142`, `apps/desktop/src-tauri/src/lib.rs:853` |
| `professional` | 1 | احترافي | same |
| `enterprise` | 2 | انتربرايز | same |

Default when nothing is licensed: `standard`, with an empty feature list
(`apps/api/src/infrastructure/license.ts:79`, `apps/desktop/src-tauri/src/license.rs:549`).
The web UI labels are `Standard` / `Professional` / `Enterprise`
(`apps/web/src/features/license/license-settings.tsx:21`).

The three editions are not cumulative feature bundles in the code. The license
carries an explicit `features` array, and `editionToMinEdition` is only the
*minimum* edition that a feature implies. Nothing adds features automatically
from the edition (`apps/api/src/infrastructure/license.ts:168`).

## 2. Feature to minimum edition

Authoritative map: `editionToMinEdition` in
`apps/api/src/infrastructure/license.ts:168`. Feature enum:
`packages/contracts/src/license.ts:29`.

| Feature | Min edition | What it is meant to enable | Wired to product code? |
| --- | --- | --- | --- |
| `lan_server` | professional | Serve the API to other machines instead of loopback only | No. The shell hardcodes `API_HOST = "127.0.0.1"` for every edition (`apps/desktop/src-tauri/src/lib.rs:17`, `:2026`). |
| `multi_user` | professional | More than one user account | No. `maxUsers` is displayed but never enforced (section 5). |
| `advanced_reports` | professional | Advanced reporting | No consumer outside the feature enum and the min-edition map. |
| `external_api` | professional | External API access | No consumer. The RPC API exists for the bundled UI, with no license gate and no API-key auth. |
| `encrypted_db` | enterprise | SQLCipher-encrypted workspace database | **Yes.** The shell checks this feature flag before setting `APP_DB_KEY`, and the desktop build refuses to package a runtime whose SQLCipher gate did not pass (section 6c). |
| `multi_site_sync` | enterprise | Multi-site data sync | No consumer. |
| `audit_export` | enterprise | Export the audit log | No consumer. The audit log itself is ungated and available in every edition. |
| `priority_support` | enterprise | Priority support | Process, not code. `docs/licensing-architecture.md:286` classifies it as "Support process (not code)". |

Only `encrypted_db` has a code path behind it. The other seven appear in the
license payload and in `editionToMinEdition` but are read by nothing that runs
in production; see section 8.

## 3. License types and expiry

The wire schema allows four `licenseType` values
(`packages/contracts/src/license.ts:21`): `perpetual`, `subscription`, `trial`,
`grace`. `validUntil` is optional at the schema level
(`packages/contracts/src/license.ts:64`); the only cross-field rule is
`validFrom <= validUntil` when `validUntil` is present
(`packages/contracts/src/license.ts:67`).

| Type | Expiry | Runtime consequence |
| --- | --- | --- |
| `perpetual` | `validUntil` absent | `status()` returns `Valid` for a missing `validUntil`, regardless of the declared type field (`apps/desktop/src-tauri/src/license.rs:465`). |
| `subscription` | Expected at issuance; not required by the schema | With `validUntil` set, expiry drives `Warning` → `ExpiredGrace` → `Locked` (section 4). |
| `trial` | Expected at issuance; not required by the schema | Same as `subscription`. |
| `grace` | N/A | Accepted by the schema but never minted and not distinguished from any other type at runtime. |

The "expiry required for non-perpetual" rule lives only in the signer CLI, and
only `[in flight]`: `assertExpiryForType` rejects `subscription`/`trial` without
`--valid-until` (`scripts/generate-license.mjs:81` on `feat/license-sellable-anchor`;
`develop` does not enforce it). Neither the zod schema nor the Rust verifier
requires it, so a hand-crafted or legacy `subscription` with no `validUntil` is
treated as perpetual (section 8, gap 5).

## 4. Runtime status states

The shell computes a `LicenseStatus` (`apps/desktop/src-tauri/src/license.rs:37`,
logic at `:412`) and exports the coarser `TUARI_LICENSE_STATUS` string only when
`LicenseManager::initialize` succeeds (`apps/desktop/src-tauri/src/lib.rs:2052`,
`apps/desktop/src-tauri/src/license.rs:502`, mapping at `:536` for a licensed
install and `:557` for no license). The API reads that string; when the
variable is absent it falls back to `standard` / no features / `maxUsers 1` /
`unknown` (`apps/api/src/infrastructure/license.ts:79`, `:61`), which refuses
writes.

| Env status (API sees) | Shell `LicenseStatus` | When it applies | Writes |
| --- | --- | --- | --- |
| `active` | `Valid`, `Warning` | Licensed and before `validUntil` (or perpetual). `Warning` is the last 30 days before expiry. | Yes |
| `trial` | `Grace` | No license file, within the 30-day post-install window. | Yes |
| `grace` | `ExpiredGrace` | Licensed, past `validUntil`, within 30 days after it. | No (read-only) |
| `expired` | `Locked` (and the currently unreachable `Expired`) | Licensed and past `validUntil` + 30 days. | No |
| `inactive` | `NotYetActive` | Clock is before `validFrom`. | No |
| `suspicious` | `Tampered` | A clock inconsistency seen by a manager that already initialized; `status()` also fails closed on tracker I/O errors (`:414`). A tamper at startup fails `initialize` instead (next row). | No |
| `unknown` | `Invalid` | No license file and outside the post-install window (`:440` returns `Invalid`, `:562` maps it to `unknown`). | No |
| `unknown` (defaulted) | none; `initialize` returned `Err` | Bad signature, malformed license, I/O error, or a clock tamper at startup (`apps/desktop/src-tauri/src/license.rs:114`). The shell then sets no license vars (`apps/desktop/src-tauri/src/lib.rs:2052`), so the API falls back to `standard` / `unknown` and refuses writes (`apps/api/src/infrastructure/license.ts:61`; the omitted status is #399). | No |

The `Writes` column is `mutationLicenseRefusalMessage`
(`apps/api/src/infrastructure/license.ts:109`), applied to every audited
mutation (section 6a). It describes `develop` at this document's base.

The 30-day post-install window is `GRACE_PERIOD_DAYS = 30`
(`apps/desktop/src-tauri/src/clock.rs:19`, check at `:131`). The 30-day
post-expiry window is an inline `chrono::Duration::days(30)`
(`apps/desktop/src-tauri/src/license.rs:452`).

Clock tampering is checked before any other status, but only after `initialize`
succeeds: `initialize` runs the same check and returns `ClockTampered`
(`apps/desktop/src-tauri/src/license.rs:114`), so a tampered clock at startup
never reaches this table. Inside `status()` the check overrides every other state
(`apps/desktop/src-tauri/src/license.rs:414`). When no license file is present,
`TUARI_LICENSE_EDITION` is `standard` and `TUARI_LICENSE_MAX_USERS` is `1`
(`apps/desktop/src-tauri/src/license.rs:549`).

The desktop UI uses a separate, finer set of status strings from the
`get_license_status` IPC command: `valid`, `warning`, `expired`,
`expired_grace`, `not_yet_active`, `tampered`, `grace`, `invalid`, `locked`
(`apps/desktop/src-tauri/src/lib.rs:1049`), plus a browser-preview fallback
`unavailable` (`apps/web/src/features/license/license-hooks.ts:46`). The web
settings page renders those
(`apps/web/src/features/license/license-settings.tsx:25`, labels at `:56`).

## 5. Seats (`maxUsers`)

| Claim | Evidence |
| --- | --- |
| `maxUsers` is a non-negative integer; `0` means unlimited. | `packages/contracts/src/license.ts:62`; `apps/desktop/src-tauri/src/license.rs:374` ("0 = unlimited"). |
| The shell parses a missing `maxUsers` as `0` (unlimited). | `apps/desktop/src-tauri/src/license.rs:299`. |
| The API reads `TUARI_LICENSE_MAX_USERS`, defaulting to `1` when the variable is absent. | `apps/api/src/infrastructure/license.ts:83`. Note the mismatch: absent in Rust is `0`, absent in the API is `1`. |
| The value reaches the API through `TUARI_LICENSE_MAX_USERS`, and `1` when no license is loaded. | `apps/desktop/src-tauri/src/license.rs:502`, `:551`. |
| The settings UI shows the seat count only when it is greater than `0`. | `apps/web/src/features/license/license-settings.tsx:244`. |
| Nothing enforces it. No code compares the user count to `maxUsers`; it is read only for display. | `grep -rn "maxUsers"` finds only the contract, the env reader, the IPC shape, and the settings UI (section 8, gap 2). |

So a `maxUsers: 1` workspace accepts unlimited user accounts today. The
architecture doc's claimed enforcement in `AuthBootstrapService`
(`docs/licensing-architecture.md:389`) does not exist in the code.

## 6. What is actually enforced today

### 6a. License status on writes

`[shipped]` The license status is binding on writes:

- `mutationLicenseRefusalMessage(status)` returns no message for `active` and
  `trial`, a read-only message for `grace`, and a refusal for `expired`,
  `inactive`, `suspicious`, `unknown`, and any unrecognised value
  (`apps/api/src/infrastructure/license.ts:109`).
- It is wired into every audited mutation through the audit-context creators
  (`requireWritableLicense` at `apps/api/src/rpc/rpc-middleware.ts:97`, called
  at `:118` and `:128`), so `mutationAudit`, `mutationAuditRateLimited`, and
  `withAudit` all refuse.
- Two non-RPC mutation routes are gated separately: profile update
  (`apps/api/src/modules/account/account.service.ts:112`) and invoice-attachment
  upload (`apps/api/src/app/create-app.ts:259`).
- Authentication runs first, so an anonymous caller gets the usual auth error
  and not the license state.
- `readLicenseRefusalMessage` is the read-side variant that also allows `grace`
  (`apps/api/src/infrastructure/license.ts:136`), used by the edition/feature
  gates.
- A missing, blank, or unrecognised `TUARI_LICENSE_STATUS` value is parsed to
  `unknown` rather than cast through, so a failed shell init or a typo fails
  closed (`apps/api/src/infrastructure/license.ts:59`).

### 6b. Edition and feature gates

`requireEdition` (`apps/api/src/rpc/rpc-middleware.ts:266`) and
`requireFeature` (`:292`) are defined and unit-tested, but no production RPC
uses either. A repo-wide grep for both names returns only the definitions and
`apps/api/src/rpc/rpc-middleware.test.ts`. No product operation is edition- or
feature-gated today.

Consequence: `lan_server`, `multi_user`, `advanced_reports`, `external_api`,
`multi_site_sync`, and `audit_export` are inert. `encrypted_db` and
`priority_support` are handled outside these gates (6c and section 2).

### 6c. Database encryption

`[shipped]` `encrypted_db` is the one feature that changes runtime behavior, and
the desktop shell enforces it:

- The shell sets `APP_DB_KEY` on the API sidecar only when
  `manager.has_feature("encrypted_db")` is true
  (`apps/desktop/src-tauri/src/lib.rs:2147`). The sidecar environment is cleared
  first, so a system-level `APP_DB_KEY` cannot leak in.
- The API database factory uses the key when present: it loads
  `better-sqlite3-sqlcipher` and runs `PRAGMA key` plus
  `cipher_compatibility = 4`. With no key it returns plain `better-sqlite3`
  (`apps/api/src/infrastructure/database/factory.ts`).
- The factory does not trust `require()`: after keying it requires a non-empty
  `PRAGMA cipher_version`. Plain `better-sqlite3` accepts the SQLCipher PRAGMAs
  as no-ops, so this proves the loaded binding is SQLCipher rather than plain
  `better-sqlite3`. A key with a non-encrypting binding is refused (connection
  closed, clear error), never ignored.
- Before opening, the factory compares the file's first bytes with the configured
  key in both directions: a plaintext `SQLite format 3` file with `APP_DB_KEY`
  set is refused (opening it under a key would corrupt it or silently defeat
  at-rest encryption), and a non-SQLite file with no key active is refused as
  encrypted-or-damaged rather than failing at the first query.
- The binding must be **shipped**, not merely buildable. `build-sidecar.mjs`
  fails the desktop build when the SQLCipher native binding is missing, instead
  of silently packaging a plaintext-only runtime (#402). The gate may be waived
  only with an explicit `--allow-plaintext` / `TUARI_ALLOW_PLAINTEXT_DB=1`, which
  prints a loud banner; a release build (`CI` / `NODE_ENV=production`) refuses
  that waiver outright, so it cannot leak a plaintext artifact out of CI.
  `typecheck` passes the waiver together with `--ephemeral`, so the runtime it
  exercises is assembled in a temp directory and never lands in `src-tauri/bin`;
  `tauri.conf.json`'s `beforeBuildCommand` re-runs the strict build, so
  `tauri build` cannot package an unverified runtime.
- The build loads the copied addon with the copied Node and requires a non-empty
  `PRAGMA cipher_version` before publishing, and the installer smoke test checks
  the same capability on the built artifact.

The end-to-end proof that a keyed write lands ciphertext lives in
`apps/api/src/modules/backup/backup.encrypted.test.ts`: it writes a keyed
database, backs it up, asserts the copy does not start with `SQLite format 3`,
reads a committed row back with the key, and refuses the copy without the key.
It runs only where the native fork can be built (node-gyp plus the platform SDK);
this workstation has no Windows SDK, so the file is `describe.skipIf`-gated and
#410's native CI job is what runs it.

Without `encrypted_db`, the workspace opens a plain, unencrypted SQLite file,
regardless of edition. That is the entire practical difference the license makes
today.

The flag is not reversible for an existing workspace. If a database was created
while the license carried `encrypted_db`, a later launch whose license lacks the
feature drops `APP_DB_KEY`. The factory reads the file header before opening it
and refuses a non-`SQLite format 3` file with a message that names both
possibilities — the workspace is encrypted and `encrypted_db`/`APP_DB_KEY` is
not active, or the plaintext file is damaged — without asserting which, rather
than failing at the first query with an opaque `file is not a database` (#402).
The same applies on the failed-init path in section 4, where the shell sets no
license vars at all.

## 7. What a buyer gets per tier

Built from sections 2 and 6. "Not enforced yet" means the license flag exists
but no code checks it, so any edition currently gets the capability.

| Capability | Standard | Professional | Enterprise | Not enforced yet |
| --- | --- | --- | --- | --- |
| Employee, project, warehouse, inventory, debts/payments, invoices, RBAC, audit log, dashboard, basic reports, backup/export | Yes | Yes | Yes | No gate exists at all; available in every edition. |
| LAN server mode | No | Intended | Intended | Yes. API is loopback-only for every edition. |
| More than one user account | Per license (`maxUsers`), not tied to the edition in code | Per license | Per license | Yes. Seats are never counted. |
| Advanced reports | No | Intended | Intended | Yes. |
| External API access | No | Intended | Intended | Yes. |
| Encrypted workspace database | Feature `encrypted_db` only | Feature `encrypted_db` only | Feature `encrypted_db` only | **Enforced.** The shell checks the flag and the factory refuses a keyed open on a non-encrypting binding; a build whose SQLCipher gate fails does not ship (6c). |
| Multi-site sync | No | No | Intended | Yes. No sync code exists. |
| Audit-log export | No | No | Intended | Yes. The audit log itself is ungated. |
| Priority support | No | No | Yes | Not code; a support commitment. |

Caveats for sales:

1. Until the edition/feature gates have callers, a standard license runs the
   full unencrypted product. The only capability the license actually withholds
   today is database encryption, and only when the license does not carry the
   `encrypted_db` feature.
2. Encryption follows the `encrypted_db` feature on the signed license, not the
   edition. `editionToMinEdition` states the minimum edition the feature implies
   (`apps/api/src/infrastructure/license.ts:168`); the shell checks
   `has_feature("encrypted_db")` (`apps/desktop/src-tauri/src/lib.rs:2147`). An
   Enterprise license without the feature opens a plain database, and a
   Professional license that carries it enables encryption. The flag is not
   reversible for an existing workspace: the file stays encrypted while the key
   is no longer passed, so it is refused with a clear "encrypted or damaged
   workspace, no key" message instead of being opened as plaintext (section 6c,
   #402).
3. The `grace` window is read-only, shipped in `develop` at this base
   (section 6a).
4. The seat counts in the architecture doc's matrix (1 / 10 / unlimited at
   `docs/licensing-architecture.md:272`) are not in the code. `maxUsers` comes
   from the license payload, and nothing enforces it.

## 8. Gaps and open decisions

Recorded, not fixed here. This lane changes no code.

1. **Feature flags are inert.** `requireEdition` and `requireFeature` have no
   production callers, so `lan_server`, `multi_user`, `advanced_reports`,
   `external_api`, `multi_site_sync`, and `audit_export` do nothing. The
   architecture doc advertises API-enforced gates for all of them
   (`docs/licensing-architecture.md:409`).
2. **Seats are not enforced.** `maxUsers` is display-only; see section 5. Also
   note the default mismatch: absent in Rust is `0` (unlimited), absent in the
   API is `1`.
3. **LAN server mode is not implemented.** `API_HOST` is the constant
   `127.0.0.1` for every edition (`apps/desktop/src-tauri/src/lib.rs:17`), so
   `lan_server` cannot change the bind address even if a gate called it.
4. **The `grace` license type is unreachable.** It is in the contract enum
   (`packages/contracts/src/license.ts:21`), but the signer CLI's type list is
   `perpetual | subscription | trial`
   (`scripts/generate-license.mjs:19` on `feat/license-sellable-anchor`; on
   `develop` the flag defaults to `perpetual` at `:47` with no allowlist), and
   the runtime ignores the type field when computing status. Decide whether to
   drop `grace` from the schema or actually mint it.
5. **Expiry is required only at issuance.** `subscription`/`trial` expiry
   enforcement is in the signer CLI (`assertExpiryForType`) and only
   `[in flight]`. The wire schema and the Rust verifier accept a non-perpetual
   license with no `validUntil` and treat it as `Valid` forever
   (`apps/desktop/src-tauri/src/license.rs:465`). Decide whether to enforce it
   in the schema/verifier.
6. **`LicenseStatus::Expired` is unreachable.** `status()` returns
   `ExpiredGrace` then `Locked`; it never returns `Expired`
   (`apps/desktop/src-tauri/src/license.rs:412`). The `expired` env status
   therefore always comes from `Locked`. The variant and its UI mapping can be
   removed or the branch added.
7. **Architecture-doc drift, both directions.** The doc claims
   `AuthBootstrapService` enforces `maxUsers` (`docs/licensing-architecture.md:389`)
   and that `.env_clear()` is missing (`:367`); neither is true in the code.
   Reconcile `docs/licensing-architecture.md` with this document.

## Evidence index

| Section | Files read |
| --- | --- |
| Editions | `packages/contracts/src/license.ts`, `apps/api/src/infrastructure/license.ts`, `apps/desktop/src-tauri/src/lib.rs`, `apps/web/src/features/license/license-settings.tsx` |
| Feature map | `apps/api/src/infrastructure/license.ts`, `packages/contracts/src/license.ts`, `apps/desktop/src-tauri/src/lib.rs` |
| License types | `packages/contracts/src/license.ts`, `apps/desktop/src-tauri/src/license.rs`, `scripts/generate-license.mjs` (both refs) |
| Status states | `apps/desktop/src-tauri/src/license.rs`, `apps/desktop/src-tauri/src/clock.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/api/src/infrastructure/license.ts`, `apps/web/src/features/license/license-settings.tsx` |
| Seats | `packages/contracts/src/license.ts`, `apps/desktop/src-tauri/src/license.rs`, `apps/api/src/infrastructure/license.ts`, `apps/web/src/features/license/license-settings.tsx` |
| Enforcement | `apps/api/src/rpc/rpc-middleware.ts`, `apps/api/src/infrastructure/license.ts`, `apps/api/src/app/create-app.ts`, `apps/api/src/modules/account/account.service.ts`, `apps/desktop/src-tauri/src/lib.rs`, `apps/api/src/infrastructure/database/factory.ts` (all on `develop` at this base) |
| Gaps | `docs/licensing-architecture.md`, the above |
