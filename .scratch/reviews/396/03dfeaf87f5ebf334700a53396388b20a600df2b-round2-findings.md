# #396 / PR #398 — review round 2: crash-safe clock state writes

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/396-trial-reset`
- base SHA (merge-base with `develop`): `7c7c83356c19d6dcfe0bac17a636df3ecdc88dae`
- `develop` head at review time (informational): `9ef83ea448676dc5283fe07e08d14659c331697f`
- reviewed code SHA: `03dfeaf87f5ebf334700a53396388b20a600df2b`
- round-1 code SHA (findings were raised against): `f734f545b239d1dc88d42cce122bfe443c4d20aa`
- review tier: High-assurance (licensing)

## Findings addressed

### P1 — `clock.rs:102` anchor write can corrupt state

**Finding.** `install-anchor.json` (and `clock-tracker.json`) were written in
place with `fs::write`. A crash mid-write, or a concurrent read, could observe
truncated/invalid JSON. The fail-closed reader (`read_anchor` /
`read_tracker` → `RustCoreError::InvalidFormat`) then locks a legitimate
installation.

**Fix.** New `write_atomic(path, contents)` in `clock.rs`:
1. stage the bytes in a temporary sibling file in the same directory,
2. `write_all` + `sync_all` (flush to disk),
3. `fs::rename` over the target.

A same-directory rename is atomic on every supported platform, so a reader
sees either the old complete file or the new complete file. Staging names are
`<file>.<pid>.<seq>.tmp`, where `seq` is a process-local `AtomicU64`, so two
concurrent writers never share a staging file. On any failure (stage write or
rename) the staging file is removed and the target is left untouched.
`write_anchor` and `write_tracker` now both delegate to `write_atomic`.

The fail-closed behaviour for a genuinely corrupt file is unchanged: a
corrupt anchor/tracker still returns `InvalidFormat`, and the corrupt file is
never silently overwritten.

### P2 — `clock.rs:79` corrupt-anchor path had no test coverage

New tests in `clock.rs`:

- `corrupt_anchor_fails_closed_and_does_not_restart_trial` — valid aged
  tracker + truncated anchor: `check_clock_consistency` returns
  `Err(InvalidFormat)`, `grace_days_remaining` errors, `is_within_grace_period`
  is not `true` (callers treat the error as "not in grace"), and the corrupt
  file is left byte-for-byte unchanged (never rewritten with `now`).
- `corrupt_tracker_fails_closed_as_before` — malformed tracker behaves as
  before (error, no grace), valid anchor preserved.
- `atomic_temp_path_is_unique_and_a_sibling_of_the_target` — staging path is a
  sibling (same volume) and unique per call.
- `atomic_write_replaces_target_and_leaves_no_staging_file` — overwrite works,
  no `.tmp` debris.
- `atomic_write_creates_missing_parent_directories` — first-run dir creation.
- `atomic_write_reports_failure_without_replacing_target_and_cleans_up` —
  rename failure surfaces an error, target is not replaced, staging removed.

## Proof (exact commands from the brief)

```
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
  → test result: ok. 119 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
    (baseline before this round: 113 passed; +6 new tests)

cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings
  → Finished `dev` profile ... (no warnings)
```

The Rust build regenerates tracked artifacts
(`apps/desktop/src-tauri/bin/node.exe`, `apps/desktop/src-tauri/gen/schemas/*`).
They were restored to HEAD before staging; the commit contains only
`apps/desktop/src-tauri/src/clock.rs`.

## Commit

- `03dfeaf87f5ebf334700a53396388b20a600df2b` — 1 file changed:
  `apps/desktop/src-tauri/src/clock.rs` (179 insertions, 9 deletions).

## Deferred / not in this lane

- Round-1 High-assurance evidence (debate, test-audit, code-review) for
  `f734f54` was not produced by this lane; this file records only the
  round-2 finding resolution. The parent owns the broader evidence set.
- `develop` has advanced past this branch's base (`7c7c833` → `9ef83ea`).
  Rebasing/merging is the parent's decision; no rebase was performed here.
- Greptile re-review of the pushed head is the parent's step (lane does not
  push).
