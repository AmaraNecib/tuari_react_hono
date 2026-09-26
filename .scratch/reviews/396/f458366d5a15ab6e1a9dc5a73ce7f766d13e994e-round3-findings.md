# #396 / PR #398 — review round 3: Windows rename retry

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/396-trial-reset`
- base SHA (merge-base with `develop`): `7c7c83356c19d6dcfe0bac17a636df3ecdc88dae`
- `develop` head at review time (informational): `9ef83ea448676dc5283fe07e08d14659c331697f`
- reviewed code SHA: `f458366d5a15ab6e1a9dc5a73ce7f766d13e994e`
- previous code SHA (finding was raised against): `07b8cf6145b5f87c5d4626a3fdfa1539e3fa595c`
- review tier: High-assurance (licensing)

## Finding addressed

### P1 — `clock.rs:133` atomic write can still fail on Windows

**Finding.** `write_atomic` staged + `sync_all` + one `fs::rename`. On Windows,
replacing the target while another process (a second app instance, an
antivirus scanner, a search indexer) holds it open for reading fails with a
sharing violation / access denied. The failure is transient, but a one-shot
rename lets that reader defeat the write: the trial anchor is never persisted
and the customer hits the fail-closed clock lock. The anchor write must not be
defeatable by a transient reader.

**Fix.** `write_atomic` now retries the rename with a bounded exponential
backoff:

- `RENAME_MAX_ATTEMPTS = 5`, `RENAME_BACKOFF_BASE_MS = 20` → sleeps of
  20/40/80/160 ms between attempts, a 300 ms worst case. Bounded: never
  `loop {}`, never retries forever.
- The staging file survives every failed attempt (deleting it after the first
  failure is what would defeat the retry) and is removed only once the write is
  given up.
- On final failure the error names the target path and carries the underlying
  OS error text: `failed to replace <path> after 5 rename attempts: <os error>`.
- The retry is testable without the OS. The rename operation and the sleep
  function are injected:

  ```rust
  fn rename_with_retry<R, S>(from, to, max_attempts, rename: R, sleep: S)
  fn write_atomic_with<R, S>(path, contents, rename: R, sleep: S)
  fn write_atomic(path, contents)  // = write_atomic_with(.., fs::rename, thread::sleep)
  ```

- Every error kind is retried, not an enumerated set of Windows sharing codes.
  The code a transient reader produces varies (access denied 5, sharing
  violation 32, lock violation 33, user-mapped file 1224); a missed code would
  silently reintroduce the defeat this exists to prevent. The attempt bound
  keeps a permanently un-writable target to a 300 ms delay before the error
  surfaces.

### New tests (`clock.rs`)

- `rename_retry_succeeds_after_a_transient_failure` — first two attempts raise
  a sharing-violation-style error, the third succeeds; asserts attempt count
  (3) and the exact backoff slept before retries 2 and 3 (20 ms, 40 ms).
- `rename_retry_gives_up_after_the_attempt_bound` — a permanent failure stops
  at the bound (4 attempts, 3 sleeps) and returns the error, not an infinite
  loop; the error kind is preserved.
- `rename_retry_backoff_doubles_within_a_bounded_window` — the schedule is
  20/40/80/160 ms, 300 ms total.
- `atomic_write_retries_past_a_transient_rename_failure` — the full write
  survives a first-attempt sharing violation, lands the new content, and leaves
  no staging file.
- `atomic_write_removes_staging_file_after_exhausting_rename_retries` —
  exhausted retries fail, the error names `state.json` **and** the OS error
  (`sharing violation`), the previous target content is intact, and no `.tmp`
  file remains.

A test that only called the real `fs::rename` could cover none of these three
behaviours; the injected closures are what make them reachable.

## Proof (exact commands from the brief)

```
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
  → test result: ok. 124 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
    (round-2 baseline: 119 passed; +5 new tests)

cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings
  → Finished `dev` profile ... (no warnings)
```

The Rust build regenerates tracked artifacts
(`apps/desktop/src-tauri/bin/node.exe`, `apps/desktop/src-tauri/gen/schemas/*`).
`git status` after the build showed only `apps/desktop/src-tauri/src/clock.rs`
modified, so there was nothing generated to restore; the commit contains only
`clock.rs` and `.agents/wisdom/security.md`.

## Commit

- `f458366d5a15ab6e1a9dc5a73ce7f766d13e994e` — 2 files changed:
  `apps/desktop/src-tauri/src/clock.rs`,
  `.agents/wisdom/security.md` (records the bounded-rename-retry rule next to
  the atomic-write rule).

## Deferred / not in this lane

- Round-1/round-2 High-assurance evidence (debate, test-audit, code-review) was
  not produced by this lane; this file records only the round-3 finding
  resolution. The parent owns the broader evidence set.
- `develop` has advanced past this branch's base (`7c7c833` → `9ef83ea`).
  Rebasing/merging is the parent's decision; no rebase was performed here.
- Greptile re-review of the pushed head is the parent's step (lane does not
  push).
