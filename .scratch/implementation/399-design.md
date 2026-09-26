# #399 — Emit an explicit license status when `LicenseManager::initialize` fails

**Ticket:** #399 (`bug`) — "Desktop shell: emit an explicit license status when
LicenseManager init fails (instead of omitting the env block)"

**Base SHA:** `17911dc` (`origin/develop`, branch `fix/shell-license-status`)
**Review tier:** High-assurance (licensing) — parent brief scopes the review to
the standard local gates; see Deferred/review notes.

## Problem

`spawn_api_process` (`apps/desktop/src-tauri/src/lib.rs`) only sets the
`TUARI_LICENSE_*` block when `LicenseManager::initialize` returns `Ok`. The
sidecar is still spawned on the failure path, and `command.env_clear()` means no
ambient value survives. Since #389 the API maps a missing/blank
`TUARI_LICENSE_STATUS` to `unknown` and refuses audited mutations — so the
bypass is closed, but a corrupt `license.lic` and a tampered clock now produce
the same opaque "license not verified" lock. The shell knows which case it hit.

## Contract

No API change. `getLicenseInfo` (`apps/api/src/infrastructure/license.ts`)
already accepts the explicit values from `LICENSE_STATUSES` and fails closed to
`unknown` for a missing/blank/unrecognised value. #399 only makes the shell
emit what the API already understands, keeping the API default as defence in
depth.

### Shell → API status mapping on init failure

| `RustCoreError` from `initialize` | `TUARI_LICENSE_STATUS` |
| --- | --- |
| `ClockTampered { .. }` | `suspicious` |
| `InvalidFormat` (malformed `license.lic`) | `unknown` |
| `InvalidPayload` | `unknown` |
| `InvalidSignature` (tampered/corrupt file) | `unknown` |
| `IoError` (unreadable file) | `unknown` |
| `InsufficientDiskSpace`, `CryptoError`, `Internal`, `ActivationFailed` | `unknown` |
| `LicenseFileNotFound`, `Expired` | `unknown` (not emitted by `initialize`; fail-closed default) |

`Expired` is deliberately not mapped to `expired`: `initialize` never returns it
(expiry is computed dynamically by `status()`), and an unattributable failure
must stay fail-closed. `suspicious` is reserved for the one failure the shell
can attribute — clock inconsistency — because the API's `suspicious` message
tells the user to fix the system clock.

### Env block on failure

`license_failure_env_map` emits the full block with the neutral defaults the API
already assumes for a missing variable (`getLicenseInfo` defaults:
`edition ?? "standard"`, `features ?? ""`, `maxUsers ?? "0"`, customer absent →
`null`, `expiresAt || null`), plus an explicit status:

```
TUARI_LICENSE_EDITION=standard
TUARI_LICENSE_FEATURES=
TUARI_LICENSE_MAX_USERS=0
TUARI_LICENSE_CUSTOMER=null
TUARI_LICENSE_EXPIRES_AT=
TUARI_LICENSE_STATUS=<suspicious|unknown>
```

`APP_DB_KEY` is not set on the failure path — with no verified license the
EncryptedDb feature is unknown and must not be granted.

## Seams and tests

- `license_status_for_error(&RustCoreError) -> &'static str` — pure mapping,
  unit-tested per variant.
- `license_failure_env_map(&RustCoreError) -> HashMap<String, String>` — pure
  env-block builder; unit-tested that status is present and non-empty (not
  omitted) and the other keys match the API defaults.
- Successful paths are untouched: `LicenseManager::to_env_map()` still yields
  `trial` for the no-license-within-trial-window case.

## Verification

- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings`
- `pnpm --filter @tuari/api test` (API unaffected)
- Restore build-regenerated tracked artifacts (`bin/node.exe`, `gen/schemas/*`,
  `Cargo.toml` line endings) to HEAD before staging.

## Deferred / review notes

The parent brief pins the verify commands and asks for the mapping + env tests;
debate/test-audit are scoped to the parent's judgement. No API change is
proposed or needed.
