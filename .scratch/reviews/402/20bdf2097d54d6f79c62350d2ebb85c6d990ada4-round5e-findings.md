# #402 / PR #409 - round 5e: a live-but-stalled owner is not abandoned

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `20bdf2097d54d6f79c62350d2ebb85c6d990ada4`
  (code fix `ccba0d3e`, docs/wisdom `20bdf209`)
- previous code SHA: `e16a49a527a469dc29c51274c2922f13084fe992` (round-5d fatal claim)
- review tier: High-assurance (licensing/crypto + packaging)

## Finding - a live build that stalls past the lease loses its backup

**Finding** (`apps/desktop/scripts/runtime-staging.mjs:124`, `isAbandonedBackup`).
The 30s marker lease was the primary abandonment signal: once
`now() - heartbeatAt > markerLeaseMs` the backup was abandoned without checking
whether the owner process was still alive. A build that renamed `bin` aside and
then stalled on a locked file for longer than the lease was treated as dead, so
an overlapping build could restore or sweep the tree it still needed for
rollback. If the stalled build's publish then failed, it had no tree to restore.

This is the third pass over the same tension. Round 5b used pid liveness alone,
so a reused pid blocked recovery forever. Round 5c used the heartbeat alone, so
a stalled live owner lost its tree. Trading one for the other is what the finding
asks to stop.

## Fix - combine the marker with the owner process's start time

- `readProcessStartTime(pid)` returns the owner's start time in epoch ms, or
  `null` when it cannot be read (unsupported platform, or a permission failure):
  - **Linux**: `/proc/<pid>/stat` field 22 (clock ticks since boot) plus
    `/proc/stat` `btime`; `USER_HZ` is 100.
  - **Other POSIX**: `ps -o lstart= -p <pid>` (second resolution).
  - **Windows**: PowerShell `(Get-Process -Id <pid>).StartTime` converted to
    Unix ms. There is no portable Node API and `wmic` is being removed.
- `probeProcess(pid)` reports `{ alive, startTime }`. `alive: false` means the
  process is gone; `alive: true, startTime: null` means it exists but the start
  time is unreadable - a distinct state from "gone". A non-positive or
  non-finite reading is normalized to `null`, so an empty probe output cannot
  parse as `0` and make every later process look like the owner.
- `isAbandonedBackup(marker, { now, markerLeaseMs, probeOwner })`:
  - no marker / no readable heartbeat -> abandoned
  - heartbeat within the lease -> owned, unless the pid is proven gone (the
    existing tiebreaker that recovers a just-crashed owner before the lease)
  - heartbeat past the lease -> the start time decides:
    - process gone -> abandoned
    - `startTime <= marker.startedAt` -> the same build is alive but stalled ->
      **owned; never stolen**
    - `startTime > marker.startedAt` -> the pid was reused -> abandoned
    - `startTime` unreadable -> the lease is the only signal left and it has
      elapsed -> abandoned
- `isAlive` is replaced by the injectable `probeOwner` on both
  `swapRuntimeDirectory` and `buildProbeAndPublishRuntime`; the platform probe is
  the default. Tests state existence and start time explicitly, so the decision
  is deterministic and never shells out.

The comments on `isAbandonedBackup` name which signal wins in each branch.

## Tests (5 new; 29 total in `runtime-staging.test.mjs`)

- `isAbandonedBackup settles ownership with the owner's start time, then the
  lease`: the four-invariant matrix in one place - (a) live stalled owner
  (`startTime <= startedAt`) -> not abandoned; (b) reused pid
  (`startTime > startedAt`) -> abandoned; (c) dead owner -> abandoned;
  (d) unreadable start time -> lease fallback (stale -> abandoned, fresh ->
  owned), plus the fresh-heartbeat tiebreaker and a pid-less stale marker.
- `a live owner that stalled past the lease keeps its backup`: the reported
  finding at the swap level. Stale heartbeat (`now = startedAt + 60s`), owner
  alive with `startTime = startedAt - 500`; the publish fails with `EBUSY` and
  the backup and its marker are untouched, nothing was restored, no recovery log.
- `a stale marker whose owner is gone is recovered`: stale heartbeat, owner gone
  -> recovery restores the dead build's runtime.
- `a reused pid does not block recovery of a stale backup`: updated so the
  injected probe returns `alive: true, startTime = startedAt + 5s` (the pid was
  reused), and the backup is still recovered.
- `a stale marker with an unreadable owner start time does not block recovery
  forever (lease fallback)`: the former "stale marker" test, now explicit that
  `startTime: null` is what makes the lease decide.
- `readProcessStartTime reads a real process start time without throwing` and
  `probeProcess finds this live process and reports a gone pid as gone`: run the
  real platform probe against `process.pid`, and assert that an injected
  `readStartTime` of `0` or `null` normalizes to the unreadable state.

## Verification (exact commands and results)

```
cd apps/desktop && node --test --test-concurrency=2 ./scripts/*.test.mjs
  -> exit 0; 54 tests: 53 pass, 1 skipped (platform: file symlinks not
     permitted), 0 fail
     runtime-staging.test.mjs alone: 29 tests, 29 pass, 0 fail

pnpm --filter @tuari/desktop test:packaging-security --maxWorkers=2
  -> exit 0; 54 tests: 53 pass, 1 skipped, 0 fail
     (node --test ignores --maxWorkers; --test-concurrency=2 above is the
      effective shared-machine limiter)

pnpm typecheck
  -> exit 0, 4 tasks successful; @tuari/desktop ran the --ephemeral waived build,
     logged the native-build skip, and reported "Removed the ephemeral sidecar
     build; nothing was left in src-tauri/bin"

pnpm lint
  -> exit 0, 2 packages successful; check:unslop PASS (1649 warn / 0 error)
```

The packaging-security suite was re-run after the final code edit and after the
docs/wisdom commit; `20bdf209` is the reviewed SHA.

## What was implemented per platform, and what could not be tested here

- **Windows (this host)**: the PowerShell process-creation-time path is real and
  exercised by the platform tests, which spawn it against `process.pid` and read
  a plausible creation time (`1790626007342` for the running process). This is
  the platform the lane actually ran on.
- **Linux**: `/proc/<pid>/stat` field 22 + `/proc/stat` `btime` is implemented
  but NOT run on this host. It is covered only by the deterministic
  injected-probe tests, not by a real probe. `USER_HZ = 100` is the standard
  Linux value and is an assumption, not verified here.
- **Other POSIX (macOS/BSD)**: `ps -o lstart=` is implemented but NOT run here.
  It is second-resolution, so a pid reused within the same wall-clock second as
  the marker write could be misread as the owner for up to that second. That is
  a smaller window than the old 30s lease and is the documented limit of the
  fallback.

## What stays unproven

- Real SQLCipher encryption. The release/probe checks prove the copied addon
  LOADS and reports a non-empty `PRAGMA cipher_version` (real SQLCipher, not
  plain better-sqlite3). They do NOT prove a keyed write encrypts. That is proven
  only by the CI job tracked in
  [#410](https://github.com/AmaraNecib/tuari_react_hono/issues/410) (native fork
  build, `PRAGMA key`, write a row, assert the file is not `SQLite format 3`,
  reopen and read), which is parked. No local or unit test substitutes; there is
  no Windows SDK on this host.
- A truly hung owner (alive, never resumes) keeps its backup indefinitely by
  design. That is the invariant this round chose: do not steal from a live
  process. A user who kills the hung build makes it dead, and the next run
  recovers it.
