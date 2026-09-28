# #402 — Never silently ship an unencrypted database

## Ticket

`AmaraNecib/tuari_react_hono#402` — "build-sidecar silently ships without
SQLCipher while APP_DB_KEY is set (encrypted_db licenses get a plain DB)".

- mode: remote
- base ref: `develop`
- base SHA: `17911dc14211730bec6982707f518b4c84dafa19`
- review tier: **High-assurance** (licensing/crypto + packaging)

## Problem

`apps/desktop/scripts/build-sidecar.mjs` falls back to a plain `better-sqlite3`
runtime with a `console.warn` and exit code 0 when the SQLCipher binding is
unavailable. The shipped desktop artifact is edition-agnostic: the shell sets
`APP_DB_KEY` whenever the license carries `encrypted_db`
(`apps/desktop/src-tauri/src/lib.rs:2102`). A customer who bought encrypted
storage therefore gets an artifact that cannot honour the guarantee.

Four independent defects make the fallback unconditional today:

1. **The binding is never built.** `pnpm-workspace.yaml`'s
   `onlyBuiltDependencies` omits `better-sqlite3-sqlcipher`, so pnpm skips its
   implicit `node-gyp rebuild`; and `pnpm rebuild <pkg>` does not run the
   implicit gyp build either (proved locally: it exits 0 and produces nothing).
   The build script's `pnpm rebuild better-sqlite3-sqlcipher` is a no-op.
2. **The availability check looks at the wrong path.** The fork's loader
   (`better-sqlite3-sqlcipher/lib/database.js`) requires
   `../build/better_sqlite3.node` — the `place_resulting_binaries` gyp target
   copies the addon there. The script checks `build/Release/better_sqlite3.node`,
   which is *plain* better-sqlite3's layout. A correctly built SQLCipher addon
   is reported missing.
3. **The SQLCipher branch is not self-contained.** The API bundle statically
   requires `better-sqlite3` (the no-key constructor) and
   `better-sqlite3-sqlcipher/lib/index.js` requires `integer`; neither is copied
   on the SQLCipher branch. On Windows the addon also needs `build/libeay32.dll`.
4. **The fallback is only a warning.** Exit code 0, no operator-visible signal.

## Decision: option (a) — fail the build

Chosen because it is the only option that **cannot silently degrade**. The
desktop artifact is the same binary for every edition and `encrypted_db` is a
sold feature, so an artifact without the capability can never honour an
`encrypted_db` license. The build is the earliest, cheapest place to catch that,
and it removes the failure class by construction: the degraded artifact is never
produced.

Option (b) (runtime refusal only) was rejected as the *primary* mechanism: it
still ships a binary that cannot encrypt, and it converts a lost guarantee into a
broken workspace. It is retained as **defense in depth** (see below) — the API
already refuses a keyed open without the binding, and this change makes that
refusal prove the binding is real SQLCipher (it reports a cipher version) rather
than plain better-sqlite3. That is a capability proof, not proof that a keyed
write lands ciphertext; see Round 5 for the exact bound.

The build requires SQLCipher by default. An explicit, documented opt-out
(`--allow-plaintext`, or `TUARI_ALLOW_PLAINTEXT_DB=1`) lets a developer produce a
knowingly plaintext-only local artifact. It prints a loud banner; it is never
used by the release scripts.

## Changed contracts

### `apps/desktop/scripts/sqlcipher-availability.mjs` (new, pure)

```js
requiredSqlcipherFiles(platform) -> string[]        // addon (+ libeay32.dll on win32)
inspectSqlcipherArtifact({ packageDir, platform, exists })
  -> { available: boolean, binaryPath: string, missing: string[] }
```

Pure, dependency-injected (`exists`), unit-tested with `node --test`. This is the
single predicate that decides "SQLCipher available" for the build.

### `apps/desktop/scripts/build-sidecar.mjs`

- Resolve + inspect SQLCipher **before** destroying the existing `bin/` tree, so
  a failed gate leaves the previous artifact intact.
- On missing: attempt a real `node-gyp rebuild` of the fork (via a pinned
  `node-gyp` devDependency), re-inspect.
- Still missing and not opted out → **throw** (non-zero exit).
- Always copy plain `better-sqlite3` + `bindings` + `file-uri-to-path`
  (the bundle always requires it).
- When SQLCipher is available, additionally copy `better-sqlite3-sqlcipher` +
  `integer`.

### `apps/api/src/infrastructure/database/factory.ts`

- `resolveDatabaseConstructor(key, loadSqlcipher?)` — injectable loader seam,
  clearer error, underlying error preserved.
- `assertBindingEncrypts(sqlite, ...)` — after `PRAGMA key`, require a non-empty
  `PRAGMA cipher_version`; otherwise close and throw. A plain binding treats the
  SQLCipher PRAGMAs as no-ops, so this proves the binding is real SQLCipher
  rather than plain `better-sqlite3` — it does not prove a keyed write encrypts
  (see Round 5).
- `assertNotEncryptedWithoutKey(path, key)` — when no key is configured and an
  existing, non-empty database file does not start with `SQLite format 3\0`,
  throw a clear "this database is encrypted but the encryption capability is not
  active" error instead of the opaque `file is not a database` at first query.
  This is the §8.3 downgrade case: an encrypted workspace whose license no longer
  carries `encrypted_db` is refused with a message that names the cause.

## Tests

- `apps/desktop/scripts/sqlcipher-availability.test.mjs` (`node --test`): correct
  path is `build/better_sqlite3.node`; `build/Release` is *not* accepted; the
  Windows `libeay32.dll` requirement; missing-file reporting.
- `apps/api/src/infrastructure/database/factory.test.ts` (vitest):
  - key + non-encrypting binding (plain `better-sqlite3`) → refused, connection
    closed, message names the binding;
  - key + binding that reports a `cipher_version` → accepted;
  - no key + plaintext SQLite file → opens;
  - no key + non-SQLite (encrypted-looking) file → refused with the clear
    message;
  - no key + missing/empty file → opens.

No test asserts a log line.

## Risks / notes

- A release build now fails when SQLCipher cannot be produced. That is the
  intended behaviour; it forces the toolchain to be fixed before shipping.
- The SQLCipher native build cannot be proved on this workstation (no Windows
  SDK). The gate, predicate and copy layout are proved by unit tests; the
  end-to-end packaging run is not claimed.
- `apps/desktop/typecheck` runs the sidecar build; it passes `--allow-plaintext`
  so typechecking does not require a native toolchain.
- Already-encrypted database without the capability: now refused up front with a
  clear message (was an opaque first-query failure).

## Round 2 (PR #409 review): the gate must prove the artifact WORKS

The first round proved *availability* (the fork's addon file exists at the
loader's path). Greptile round 1 (4/5) flagged three gaps in the build and
packaging path. All three are fixed.

### 1. A stale addon passed the gate (`sqlcipher-availability.mjs`)

The predicate only checked that a file existed, so an addon compiled against a
different Node ABI was accepted; the sidecar then bundled the current Node with
an unloadable binary and the failure surfaced on a customer machine.

`probeSqlcipherBinding({ nodeExecPath, runtimeDir, execFile? })` is the new
proof. After the runtime is copied, `build-sidecar.mjs` runs the copied fork
with the **copied** Node executable (`node -e`, cwd = sidecar root) and requires
a non-empty `PRAGMA cipher_version` — the same capability probe the API applies
at runtime. `execFile` is injected so the wrapper (success, loader stderr,
empty version) is unit-tested, and one test drives a real synthetic addon that
exists but cannot load. The load test is authoritative; a recorded Node version
would be a redundant heuristic, so no ABI marker file is written.

### 2. `typecheck` left a plaintext runtime, and packaging did not re-validate

`typecheck` built `--allow-plaintext` straight into `src-tauri/bin`; a later
direct `tauri build` could package it without re-running the strict gate.

- `typecheck` now passes `--ephemeral`: the build runs end to end in a
  `mkdtemp` directory under the OS temp root and the directory is removed in a
  `finally` (including when the gate refuses). Nothing plaintext is ever written
  to `src-tauri/bin`. This is safe because `cargo check` only needs the tracked
  `bin/api-runtime` + `bin/node.exe` placeholders to exist for tauri-build's
  resource copy, which the build does not touch.
- `tauri.conf.json` `beforeBuildCommand` now runs the frontend build **and** the
  strict `sidecar:build`, so `tauri build` (however invoked) can never package a
  runtime the strict gate would reject; it either rewrites `bin/` with a verified
  runtime or fails. `build` / `tauri:build` were reduced to `tauri build` so the
  sidecar build runs once.
- `--allow-plaintext` remains only on the typecheck path.

### 3. The installer smoke check could pass on plain `better-sqlite3`

`scripts/smoke/installer-smoke.mjs` searched a candidate list that included the
plain binding at `build/Release` and the fork at `build/Release` (plain's
layout). Because plain `better-sqlite3` is now always copied, the check could
pass on an artifact with no encryption support. The check is now three parts:
plain binding at `build/Release`, the fork independently at its loader path
`build/better_sqlite3.node`, and a real capability probe (`cipher_version`) run
with the extracted `bin/node.exe`. `docs/release-verification.md` was updated to
match the new check list and count.

### Verification bounds (unchanged)

- A real SQLCipher native build needs the Windows SDK; this host has node-gyp
  but not the fork's toolchain, so the positive load path is exercised with the
  real plain binding only where it applies, and the refusal path with a
  synthetic addon. The full `tauri build` packaging run is not claimed.


## Round 3 (PR #409 review, 2026-09-28T00:08Z): cleanup reporting + encryption honesty

Two further P2 findings. Both fixed.

### 1. A post-publication cleanup failure must not look like a failed publish

`swapRuntimeDirectory` removed the renamed-aside previous tree AFTER the staged
tree was live, and that removal was the last statement of the function: if it
threw, `buildProbeAndPublishRuntime` propagated it, so `build-sidecar.mjs`
exited non-zero even though `src-tauri/bin` had already been replaced. Whoever
read the exit code would conclude the previous runtime was still in place.

Decision: warn and succeed, not a distinct failure. The exit code's meaning is
"was the runtime published?"; after the swap the answer is yes, and a failure
exit would keep the exact misreading the finding describes. The leftover
directory is inert (the new runtime is live) and the warning names both the live
destination and the leftover path, plus the cause. A failure clearing a stale
backup BEFORE the swap stays fatal: nothing has been published at that point.
The warning is injectable (`warn`) so both sides of that line are tested.

### 2. The probe tests prove plumbing, not encryption

The positive control in `sqlcipher-availability.test.mjs` uses a JavaScript
stand-in that returns a version string without encrypting anything. It is
renamed to say so ("proves the probe's plumbing, not encryption"), the file
gained a module-level coverage-boundary comment, and a new test drives the real
spawned Node against a synthetic binding whose `cipher_version` comes back empty
(the probe source's own `process.exit(3)` refusal path).
`docs/release-verification.md` now states that real encryption is proven only by
the CI job in #410 (native fork build, write with a key, assert the file is not
`SQLite format 3`, reopen and read), that no local test substitutes for it, and
the smoke script header and `docs/editions-and-features.md` stop claiming a
local check proves encryption.

## Round 4 (PR #409 review, 2026-09-28T00:08Z, parent-approved follow-up): waiver coverage + interrupted-swap recovery

The same review round raised two more findings. The lane brief initially
excluded them; the parent approved picking them up before the next push.

### 1. The plaintext waiver must cover an unloadable addon (`build-sidecar.mjs`)

The waiver (`--allow-plaintext` / `TUARI_ALLOW_PLAINTEXT_DB=1`) only guarded the
availability gate. An addon that existed at the loader path but could not load
with the bundled Node passed the gate, then failed the staged probe, so a
waived build still exited non-zero. A waiver that does not cover the failure it
exists for looks supported and then blocks the builds that need it.

The banner moved into `printPlaintextOnlyWarning(detail)` and the probe now
catches the failure: without the waiver it rethrows (unchanged strict
behaviour), with the waiver it prints the same banner, naming the probe error as
the reason, and lets the build publish. The banner gained the explicit line
"The runtime cannot encrypt a database"; the `encrypted_db` refusal and "never
ship this artifact" text are unchanged. The waiver stays strictly opt-in and
release scripts still never pass it.

### 2. An interrupted swap must recover its own state (`runtime-staging.mjs`)

A run killed between `rename(destinationDir, backupDir)` and
`rename(stagingDir, destinationDir)` left no destination plus a
`destinationDir.previous-<pid>` backup. The next build saw no destination, so it
published normally but never restored or cleared the stranded backup; the
recovery depended on the destination already existing.

`swapRuntimeDirectory` now scans the destination's parent for
`<basename>.previous-*` siblings. When the destination is missing and one
exists, it restores the backup first (logging what state it found and what it
did) and then runs the normal swap. Chosen over "publish and clear" because the
restore also repairs the state when the publish rename fails: the catch now
restores a runnable runtime instead of leaving nothing. It also consolidates the
backup naming, so crashes cannot accumulate stranded directories. Any remaining
backups from earlier interrupted runs are swept after the next successful
publish, with the same warn-don't-fail policy as the post-publication cleanup.
The scan (`readdir`) and the recovery log (`log`) are injectable, so the success,
publish-failure, and sweep paths are unit-tested.

## Round 5 (PR #409 review, 2026-09-28T19:30Z): three fixes + one answered gap

The hosted review on `e534c9a` raised four findings. Three are fixed here; the
fourth is a known, documented gap that the release gate does not close on a host
without the native toolchain, and it is answered rather than papered over.

### 1. Recovery must restore the NEWEST backup (`runtime-staging.mjs`)

`findPreviousRuntimeBackups` sorted by filename and recovery took `leftovers[0]`,
i.e. the alphabetically first remaining `.previous-*` directory. Filename order
is not recency order — the reviewer's `previous-1000` / `previous-999` pair is
one shape of the defect — so an interrupted run could come back as an older
runtime than the one it had just built.

Backups are now named `<destination>.previous-<epochMs>-<pid>`. The epoch is the
recency signal recovery sorts by (descending, newest first); the pid keeps two
builds that start in the same millisecond distinct. `swapRuntimeDirectory` and
`buildProbeAndPublishRuntime` take an injectable `now`/`pid` so the name is
deterministic in tests. Legacy pid-only names parse as their own number and sort
before every timestamped backup, which is correct (they predate this build).
The new test seeds two backups whose alphabetical order is the reverse of their
recency and forces the publish to fail, so the live runtime is provably the
newer tree.

### 2. A waived ephemeral run must not attempt the native build (`build-sidecar.mjs`)

`typecheck` runs `--allow-plaintext --ephemeral` precisely so it can run without
a native toolchain, but `resolveSqlcipher` attempted `node-gyp rebuild` before
the waiver was consulted, so a clean checkout paid for a native build it does not
need.

The availability decision moved into a pure, injectable
`resolveSqlcipherArtifact({ packageDir, platform, plaintextAllowed, ephemeral,
exists, buildNative, log })` in `sqlcipher-availability.mjs`. It skips the build
when the waiver is active AND the run is ephemeral, and still attempts it for a
waived publishing run (a real artifact is produced plaintext only when the
binding genuinely cannot be built) and whenever no waiver is active. `buildNative`
is the real `node-gyp` driver in production and a spy in the tests, so the tests
assert the callback is never invoked on the skipped path — not merely that a
predicate returned false. The banner is unchanged on every plaintext path.

### 3. An unrecognised file header must not be diagnosed as encrypted (`factory.ts`)

`assertNotEncryptedWithoutKey` reported any non-empty file without the exact
`SQLite format 3\0` header as "almost certainly SQLCipher-encrypted", so a
truncated or corrupt plaintext database sent its operator to the license/key
instead of to the damaged data.

The message now names both possibilities without asserting either: the file is
either SQLCipher-encrypted (expected when no key is active) or damaged, the
build cannot tell them apart, and it says what to check in each case — key and
`encrypted_db` for the encrypted case, truncation/corruption for the plaintext
case. The test pins the absence of "almost certainly" and the presence of the
damage and "cannot tell those apart" wording. `docs/licensing-architecture.md`
and `docs/editions-and-features.md` are updated to match.

### 4. "Encryption remains untested" — answered, not fixed

The finding is correct and the gap is already documented: the release check
proves the copied addon loads with the bundled Node and reports a non-empty
`PRAGMA cipher_version`. That distinguishes real SQLCipher from plain
better-sqlite3, whose PRAGMAs are no-ops. It does not prove a keyed write
encrypts. Real encryption is proven only by the CI job tracked in #410 (native
fork build, `PRAGMA key`, write a row, assert the file is not `SQLite format 3`,
reopen with the key and read the row). This host has no Windows SDK, so no local
or unit test can substitute, and none is claimed.

Because a probe that reports a version while failing to encrypt would pass the
release gate, the code and docs must not describe `cipher_version` as proving
encryption. The probe's doc comment in `sqlcipher-availability.mjs`, the staged
probe comment in `build-sidecar.mjs`, and `assertBindingEncrypts`' doc comment in
`factory.ts` now say "real SQLCipher, not a no-op — not proof that a keyed write
encrypts", and point at #410 for the end-to-end proof.
`docs/release-verification.md` and `docs/editions-and-features.md` already state
the same bound; `docs/release-verification.md` §"Real encryption is proven only
by CI (#410)" is the canonical statement.

## Round 5b (parent decision, same review): overlapping builds must not steal an active backup

The round-5 review also kept an earlier P2 alive (`runtime-staging.mjs:65-75`,
"overlapping builds steal active backups"): two builds running at once could
treat each other's in-flight `bin.previous-*` as stranded and move or delete it,
so one build could lose the runtime the other was still publishing. The parent
asked for it to be fixed before the next push so the review does not re-raise it.

### Rule: a backup is touched only when its owning process is provably gone

The backup name already carries the owner pid (`<dest>.previous-<epoch>-<pid>`).
`isAbandonedBackup(ownerPid, { isAlive, pid })` is the ownership gate:

- `ownerPid === our pid` -> **abandoned**. A pid names one live process, so a
  backup with OUR pid cannot belong to a concurrent build; it is litter from an
  earlier incarnation (a crash, or the pid reused after a reboot) and recovery
  may take it even though the pid is "alive" because it is us.
- any other pid -> abandoned only when `isAlive(ownerPid)` is false. The default
  probe is `process.kill(pid, 0)` (`ESRCH` = gone, `EPERM` = exists but not
  signallable, still alive).
- unparseable owner -> never abandoned. A tree we cannot prove is dead stays, or
  a concurrent publishing build would lose its rollback backup.

`findAbandonedRuntimeBackups` filters by this gate BEFORE sorting by recency, so
recovery restores the newest ABANDONED backup and the post-publish sweep removes
only abandoned ones. `isAlive` is injectable on both `swapRuntimeDirectory` and
`buildProbeAndPublishRuntime` so the rule is tested without spawning processes.

### Tests

- `a backup owned by a live process is not restored when the destination is
  missing` - the live build's backup stays put, no recovery log, the staged
  runtime is published.
- `a backup owned by a live process is not swept when the destination exists` -
  the live backup survives the sweep while a dead-pid sibling alongside it is
  cleaned up.
- `recovery skips a live-pid backup and restores the newest abandoned one` -
  a newer live-pid backup is ignored in favour of an older dead-pid one.
- `a backup named with this process's own pid is recoverable` - own-pid litter
  from a prior incarnation is still recovered.
- `a legacy pid-only backup is recovered when its owner is gone` - the legacy
  name format still parses and recovers.

What this does NOT solve: two builds can still race to publish the same
destination (the losing one fails its rename and restores its own backup), and a
pid reused by an unrelated live process blocks that backup's recovery/sweep
(conservative: left rather than stolen). Both are out of scope for this finding.

## Round 5c (parent decision, review 2026-09-28T19:57Z): ownership markers, not pid liveness

**Finding** (`runtime-staging.mjs:70`, "Reused PID blocks recovery"). The
round-5b rule called a backup abandoned when its pid was gone. If a build stopped
after moving `bin` aside and an unrelated process later received that pid, the
intact backup looked owned: recovery was skipped, and if the next staged publish
then failed, `bin` stayed missing even though a working runtime sat in the
backup. PID liveness cannot establish ownership.

**Fix.** Ownership is now a marker file written next to the backup,
`<backup>.previous-<epoch>-<pid>.owner`, containing
`{ pid, startedAt, heartbeatAt }`.

- The owning build writes the marker BEFORE renaming `bin` aside and refreshes
  the heartbeat at the boundary that can block (right before the publish
  rename); it removes the marker when it releases the backup. So a live build
  keeps the marker fresh and a dead one cannot.
- `isAbandonedBackup(marker, { now, markerLeaseMs, isAlive })`:
  - no marker, or a corrupt one whose file mtime has also aged -> abandoned
  - heartbeat older than the lease (30s) -> abandoned (the PRIMARY signal)
  - fresh but the owner pid is gone -> abandoned (the pid probe is only a
    tiebreaker, used to recover a just-crashed owner before the lease elapses)
  - fresh with an unknown or a live owner -> owned; never steal it
- `readOwnerMarker` takes freshness from the file's `heartbeatAt`, falling back
  to the file mtime when the content is unparseable: a reader that catches a
  partial write still sees a fresh mtime, so a live owner is never mistaken for
  a dead one.
- Recovery and the sweep call `findAbandonedRuntimeBackups`, which filters by
  the marker before the recency sort; both remove the marker of a tree they
  consume.

**Why the marker is not just the pid.** A pid is reused. The heartbeat is the
thing only the real owner can produce; when it stops, the marker ages and the
backup becomes recoverable regardless of who now holds the pid. The pid probe is
kept only to shorten the wait when the owner is provably gone.

**Tests (9, all in `runtime-staging.test.mjs`).**
- fresh marker -> not restored when the destination is missing (a)
- fresh marker -> not swept when the destination exists (a)
- recovery skips a fresh-marker backup and takes the newest abandoned one
- **a reused pid does not block recovery of a stale backup** (b: an injected
  `isAlive` says pid 777 is alive, but the marker is stale -> recovered)
- a backup with no marker is recovered
- a fresh marker whose owner pid is gone is abandoned (tiebreaker)
- **a stale marker does not block recovery forever** (c: fresh -> owned, then
  the same backup past the lease -> recovered)
- a corrupt marker is owned while its mtime is fresh and abandoned once it ages
  (the partial-write fallback)
- a successful publish removes this build's ownership marker

**Residual window, stated rather than hidden.** A marker is fresh for up to the
30s lease. If a build crashes and an unrelated process receives its pid within
that window, the backup still looks owned until the lease elapses. The swap is a
few synchronous renames (well under the lease), so this window is the crash-to-
reuse race, not a normal overlap; a `process.kill(pid, 0)` probe and then
staleness both resolve it, and the machine is never left without a runtime
permanently.

## Round 5d (review): the initial ownership claim is fatal

**Finding** (`runtime-staging.mjs`, `claimBackupOwnership`). The first
`writeMarker` call shared the warn-and-continue handler with the later
heartbeats. If it failed, the swap still ran with no marker on disk, so
`readOwnerMarker` returned `null`, `isAbandonedBackup(null)` called the tree
abandoned, and an overlapping build could recover or sweep the backup after this
build had renamed `bin` aside - leaving this build without its rollback tree.

**Fix.**

- `claimBackupOwnership` writes the marker before returning `beat`; a failed
  initial write throws instead of warning.
- `swapRuntimeDirectory` claims inside its `try`, before `remove(backupDir)` and
  `rename(destinationDir, backupDir)`, so a failed claim aborts with the
  destination untouched and the `finally` clears any partial marker.
- A refresh failure after the claim stays non-fatal (the marker ages from its
  last successful heartbeat and the live pid holds the lease) and warns once per
  failure run, resetting after a successful beat.

**Tests (3 new; 24 total).** A failed initial write aborts before any rename with
the destination byte-for-byte intact; a failed boundary heartbeat does not abort
and the surviving marker is owned to the lease boundary and abandoned past it;
repeated failures warn once and warn again after a recovery.

## Round 5e (review): a live-but-stalled owner is not abandoned

**Finding** (`runtime-staging.mjs:124`, `isAbandonedBackup`). The lease was the
primary abandonment signal: once `now() - heartbeatAt > markerLeaseMs` the
backup was abandoned without checking whether the owner process was still alive.
A build that renamed `bin` aside and then stalled on a locked file for longer
than the 30s lease was treated as dead, so an overlapping build could restore or
sweep the tree it still needed for rollback; if the stalled build's publish then
failed, it had nothing to restore. This is the third pass over the same tension:
round 5b used pid liveness alone (a reused pid blocked recovery forever), round
5c used the heartbeat alone (a stalled live owner lost its tree).

**Fix - combine the marker with the owner's process start time.**

- New `readProcessStartTime(pid)` reads the owner's start time in epoch ms and
  returns `null` when it cannot (unsupported platform or a permission failure):
  - Linux: `/proc/<pid>/stat` field 22 (clock ticks since boot) plus
    `/proc/stat` `btime`; `USER_HZ` is 100.
  - Other POSIX: `ps -o lstart= -p <pid>` (second resolution).
  - Windows: PowerShell `(Get-Process -Id <pid>).StartTime` converted to Unix
    ms, because Node has no portable API and `wmic` is being removed.
- New `probeProcess(pid)` reports `{ alive, startTime }`. `alive: false` means
  the process is gone; `alive: true, startTime: null` means it exists but the
  start time is unreadable, which is a distinct state from "gone".
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

**Invariants tested (5 new; 29 total in `runtime-staging.test.mjs`).**

- (a) a live owner that stalled past the lease keeps its backup (integration:
  nothing restored, marker intact, no recovery log) - the reported finding;
- (b) a reused pid still does not block recovery (the previous finding);
- (c) a stale marker whose owner is gone is recovered (and the fresh-heartbeat
  tiebreaker still recovers a just-crashed owner early);
- (d) an unreadable start time falls back to the lease (stale -> abandoned,
  fresh -> owned);
- plus a decision-matrix unit test for all four and a real-host check that
  `readProcessStartTime(process.pid)` and `probeProcess(process.pid)` read the
  live process without throwing.

**What could not be tested here.** This host is Windows, so the PowerShell path
is exercised for real (the platform tests above spawn it). The Linux `/proc`
parse and the `ps -o lstart=` parse are implemented but not run on this host;
they are covered only by the deterministic injected-probe tests, not by a real
probe. The `USER_HZ = 100` assumption is standard on Linux but is an assumption.

