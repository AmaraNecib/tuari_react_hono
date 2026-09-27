# #399 test audit — `<sha>` `518fdab`

- **Reviewed HEAD:** `518fdab`
- **Tier:** High-assurance (licensing)
- **Author of tests:** same lane (self-audit); see "Independent audit" note.

## Tests added

| Test | File | What it pins |
| --- | --- | --- |
| `maps_every_initialize_failure_to_an_explicit_license_status` | `lib.rs` | Each `RustCoreError` variant → expected status string. 11 variants incl. `ClockTampered`, `InvalidFormat`, `InvalidPayload`, `InvalidSignature`, `IoError`, `InsufficientDiskSpace`, `CryptoError`, `Internal`, `ActivationFailed`, `LicenseFileNotFound`, `Expired`. |
| `failed_init_env_map_contains_an_explicit_status_not_an_omitted_block` | `lib.rs` | The status key is **present** and non-blank for a failed init, the other five keys match the API defaults, and the clock case yields `suspicious`. |
| `to_env_map_reports_trial_for_no_license_inside_the_trial_window` | `license.rs` | The unchanged success path still reports `trial` for a no-license manager inside the trial window. |

## Edge-case matrix

| Case | Covered? | Where |
| --- | --- | --- |
| Clock tamper | yes | mapping test + env-map test |
| Malformed file (no `.` separator / bad base64) → `InvalidFormat` | yes | mapping test |
| Tampered payload → `InvalidPayload` | yes | mapping test |
| Bad signature → `InvalidSignature` | yes | mapping test |
| Unreadable file → `IoError` | yes | mapping test (real `std::io::Error`) |
| Disk full → `InsufficientDiskSpace` | yes | mapping test |
| Crypto/internal/activation errors | yes | mapping test |
| `LicenseFileNotFound` / `Expired` (not emitted by `initialize`) | yes | mapping test, documented as fail-closed default |
| Env key omitted / blank | yes | env-map test asserts presence + non-blank |
| Neutral defaults match the API | yes | env-map test asserts all five keys |
| No-license trial stays `trial` | yes | `license.rs` regression test |
| API accepts the produced values and stays fail-closed on its own | yes | pre-existing `apps/api/src/infrastructure/license.test.ts` (`LICENSE_STATUSES`, missing/blank/unrecognised → `unknown`) |

## Meaningful-assertion check

- Assertions are exact-value (`"suspicious"`, `"unknown"`, `"trial"`), not
  `is_some()`. A blank or typo'd status fails the test.
- The env-map test asserts the *key set* defaults, not just the status, so a
  future refactor that drops a default is caught.
- No sleeps, no network, no temp state beyond `std::env::temp_dir()` (cleaned up).

## Residual gaps (not blockers)

- The spawn wiring (`match initialize { Err => for (k,v) in license_failure_env_map }`)
  itself is not unit-tested: it needs a live `AppHandle`. The pure function it
  calls is fully tested; the wiring is a 3-line loop. An integration test would
  need the sidecar smoke harness, which is heavier than this change warrants.
- `resolve_tuari_dir` failing skips both branches (pre-existing, out of scope).

## Independent audit

The guard's High-assurance tier calls for an independent `test-audit` agent.
This audit is a self-review per the lane brief's verify scope. Flagged for the
parent.
