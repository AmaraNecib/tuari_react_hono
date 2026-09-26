# #396 — deleting clock-tracker.json restarts the 30-day trial

- mode: remote (parent owns push/PR)
- base SHA: `7c7c83356c19d6dcfe0bac17a636df3ecdc88dae` (develop)
- review tier: High-assurance (licensing)

## Problem

`clock-tracker.json` carries two unrelated facts:

- `last_seen_wall` — the clock high-water mark used for tamper detection. It
  must stay resettable: the documented recovery for a clock warning is
  deleting the file.
- `install_wall` — the post-install trial anchor. `grace_days_remaining`
  subtracts it from `Utc::now()` and `LicenseManager::status()` returns
  `Grace` while that window is open.

When the file is missing, `check_clock_consistency` recreates it with
`install_wall = now`. Deleting one file therefore restarts the 30-day trial,
repeatably.

## Design

Split the resettable state from the trial anchor.

1. Keep `clock-tracker.json` exactly as-is (same struct, same JSON shape). It
   stays the resettable high-water mark.
2. Add a second file, `install-anchor.json`, in the same state directory. It
   holds only `install_wall`. The clock-tamper recovery deletes
   `clock-tracker.json`, not this file, so the anchor survives the reset.
3. `resolve_install_wall(state_dir)` reads both files and returns the
   **earliest** `install_wall` present. `check_clock_consistency` and
   `grace_days_remaining` both go through it.
4. The anchor is monotonic: it is written when absent and only ever moved
   earlier. A freshly recreated tracker (from the recovery path or from a
   pre-anchor upgrade) seeds the anchor with its value instead of `now`.
5. A corrupt anchor is a hard error. `LicenseManager::status()` already maps
   clock errors to `Tampered` and `is_within_grace_period` maps them to
   "not in grace", so corruption fails closed rather than restarting the trial.

Why a second file and not the SQLite database creation time: Rust Core has no
SQLite dependency and does not know the project layout (the DB lives at
`<data_dir>/projects/default/tuari.sqlite`, opened by the Hono sidecar). File
`created()` time is unavailable on some Linux filesystems. A sibling file is
the smallest durable anchor that the recovery path is not allowed to delete,
and needs no new dependency or API/contract change.

### Behaviour

- Genuine fresh install (no tracker, no anchor): both files created with
  `now`; `Grace` with the full 30 days.
- Clock-tamper recovery (delete tracker): `check_clock_consistency` recreates
  the tracker with the anchor's install time and returns `Trusted`. The trial
  is not extended.
- Aged no-license install after tracker deletion: the anchor still says the
  install is old, `grace_days_remaining == 0`, status stays out of `Grace`
  (currently `Invalid` for "no license, past window"; unchanged by this fix).
- Licensed install: the clock check still returns `Trusted` and the anchor
  never affects the license branch.

### Contracts

- `ClockTracker` JSON shape unchanged (wire compat).
- License wire format, `LicenseStatus` variants, and status mapping unchanged.

## Tests

`clock.rs` unit tests:

- fresh install gets the full window (anchor and tracker created);
- deleting the tracker on an aged install keeps `grace_days_remaining == 0`
  and `is_within_grace_period == false`;
- the tamper-recovery path still clears a `Suspicious` state to `Trusted`;
- an older tracker `install_wall` seeds a missing anchor (upgrade path), so an
  install that predates the anchor cannot extend its trial by deleting the
  tracker;
- a tracker with a future `install_wall` cannot inflate the window past the
  earlier anchor.

`license.rs` unit tests:

- no-license aged install stays out of `Grace` after the tracker is deleted;
- licensed install stays `Valid` after the tracker is deleted.
