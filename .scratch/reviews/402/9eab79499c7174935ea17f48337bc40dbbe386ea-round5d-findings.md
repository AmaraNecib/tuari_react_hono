# #402 / PR #409 - round 5d: a failed initial ownership claim is fatal

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `9eab79499c7174935ea17f48337bc40dbbe386ea` (code fix `eddc1509`, wisdom `9eab794`)
- previous code SHA: `fbe7b03db40cf0ec8fca7b6726735bc4208ee803` (round-5c markers)
- review tier: High-assurance (licensing/crypto + packaging)

## Finding - marker-write failure can expose an active backup to recovery

**Finding** (hosted review, `runtime-staging.mjs` `claimBackupOwnership`). The
initial `writeMarker` call was wrapped in the same warn-and-continue handler as
the later heartbeats. If that first write failed, the swap still proceeded with
no marker on disk. `readOwnerMarker` then returns `null`,
`isAbandonedBackup(null)` treats the tree as abandoned, and an overlapping build
can recover or sweep the first build's backup after it renamed `bin` aside -
leaving the first build without the tree it needs for rollback.

## Fix - the initial claim is fatal; only later heartbeats may fail

- `claimBackupOwnership` writes the marker BEFORE it returns a `beat`. A failed
  initial write now throws (`Could not claim ownership of the runtime backup at
  <path>: ...`) instead of warning.
- `swapRuntimeDirectory` claims ownership inside its `try`, before
  `remove(backupDir)` / `rename(destinationDir, backupDir)`. A thrown claim
  therefore aborts with the destination untouched; the `finally` clears any
  partial marker. The destination is never renamed aside without a marker.
- A refresh failure AFTER the claim stays non-fatal: the swap has already
  begun, the marker on disk ages from its last successful heartbeat, and the
  live owner's pid keeps protecting the tree until the lease expires. Only the
  first failure in a run warns (`refreshFailed` latch, reset on a successful
  beat), so a persistent failure is visible without warning on every beat.
- The `swapRuntimeDirectory` doc comment now states the claim is fatal and why.
- Durable lesson captured in `.agents/wisdom/desktop-packaging.md`: a claim
  another process uses to decide whether to steal your work must be fatal if it
  fails, before anything is moved.

## Tests (3 new, 24 total in `runtime-staging.test.mjs`)

- `a failed initial ownership-marker write aborts before the destination is
  renamed aside`: `writeMarker` throws on the first call; the build throws
  `/Could not claim ownership/`, exactly one write was attempted, no rename ran,
  the destination hash is unchanged, no `.previous-*` sibling exists, and there
  are zero warnings (thrown, not downgraded). This is the reported failure.
- `a heartbeat failure mid-swap does not abort and the marker still protects the
  tree until the lease expires`: the boundary beat fails; the publish still
  succeeds, warns once, and the marker captured at the failure still carries the
  initial heartbeat - owned (`isAbandonedBackup` false) at the lease boundary,
  abandoned one millisecond past it.
- `repeated heartbeat failures warn once per run and warn again after a
  recovery`: two consecutive failed beats warn once; a successful beat clears the
  latch, so the next failure warns again.

## Verification (exact commands and results)

```
pnpm --filter @tuari/desktop test:packaging-security --maxWorkers=2
  -> 49 tests: 48 pass, 1 skipped (platform: file symlinks not permitted), 0 fail
     runtime-staging.test.mjs alone: 24 tests, 24 pass, 0 fail

pnpm typecheck
  -> exit 0, 4 tasks successful; @tuari/desktop ran the --ephemeral waived build,
     logged the native-build skip, and reported "Removed the ephemeral sidecar
     build; nothing was left in src-tauri/bin"

pnpm lint
  -> exit 0, 2 packages successful; check:unslop PASS (1649 warn / 0 error)
```

## What stays unproven

- Real SQLCipher encryption. The release/probe checks prove the copied addon
  LOADS and reports a non-empty `PRAGMA cipher_version` (real SQLCipher, not
  plain better-sqlite3). They do NOT prove a keyed write encrypts. That is proven
  only by the CI job tracked in
  [#410](https://github.com/AmaraNecib/tuari_react_hono/issues/410) (native fork
  build, `PRAGMA key`, write a row, assert the file is not `SQLite format 3`,
  reopen and read), which is parked. No local or unit test substitutes; there is
  no Windows SDK on this host.
- The full `tauri build` / installer smoke run; the two #402 SQLCipher smoke
  checks have not run against a full packaging build.
- Residual ownership window, unchanged from round 5c: a marker is fresh for up
  to the 30s lease, so a crash followed by pid reuse WITHIN that window still
  looks owned until the lease elapses. The swap is a few synchronous renames
  (well under the lease), so this is the crash-to-reuse race, not a normal
  overlap; staleness then resolves it and the machine is never left without a
  runtime permanently.
- Two builds can still race to publish the same destination (the loser fails its
  rename and restores its own backup). Out of scope for this finding.
