# #402 / PR #409 - round 5c: ownership markers replace pid liveness

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `fbe7b03db40cf0ec8fca7b6726735bc4208ee803`
- previous code SHA: `ea8f3272d686ee4ff62199d6c2efeea0e202e828` (round-5b pid-liveness rule)
- review tier: High-assurance (licensing/crypto + packaging)

## Finding - a reused PID blocks recovery

**Finding** (hosted review 2026-09-28T19:57Z, `runtime-staging.mjs:70`,
"Reused PID blocks recovery"). The round-5b rule called a backup abandoned when
its pid was gone. If a build stopped after moving `bin` aside and an unrelated
process later received that pid, the intact backup looked owned: recovery was
skipped, and if the next staged publish then failed, `bin` stayed MISSING even
though a working runtime sat in the backup. PID liveness alone cannot establish
ownership.

## Fix - own the backup with a heartbeat marker, use the pid only as a tiebreaker

Ownership is a marker file next to the backup,
`<backup>.previous-<epoch>-<pid>.owner`, containing
`{ pid, startedAt, heartbeatAt }`:

- The owning build writes the marker BEFORE renaming `bin` aside and refreshes
  the heartbeat at the boundary that can block (immediately before the publish
  rename); it removes the marker when it releases the backup. A live build keeps
  the marker fresh; a dead one cannot.
- `isAbandonedBackup(marker, { now, markerLeaseMs, isAlive })`:
  - no marker, or a corrupt one -> abandoned
  - heartbeat older than the lease (30s) -> abandoned (the PRIMARY signal)
  - fresh but the owner pid is gone -> abandoned (the pid probe is only a
    tiebreaker, to recover a just-crashed owner before the lease elapses)
  - fresh with an unknown or a live owner -> owned; never steal it
- `readOwnerMarker` takes freshness from `heartbeatAt`, falling back to the file
  mtime when the content is unparseable: a reader that catches a partial write
  still sees a fresh mtime, so a live owner is never mistaken for a dead one.
- `findAbandonedRuntimeBackups` filters by the marker before the recency sort.
  Recovery and the sweep remove the marker of a tree they consume. Marker names
  are excluded from the backup scan (`*.owner`).

**Why the marker is not just the pid.** A pid is reused; the heartbeat is the
one signal only the real owner can produce. When it stops, the marker ages and
the backup is recoverable regardless of who holds the pid. The pid probe is kept
only to shorten the wait when the owner is provably gone.

## Invariants and tests (all in `runtime-staging.test.mjs`)

- **(a) a backup whose owner is genuinely mid-build is never restored or swept**
  - `a backup with a fresh ownership marker is not restored when the destination
    is missing` (fresh marker + live pid; a forced publish failure proves nothing
    was restored)
  - `a backup with a fresh ownership marker is not swept when the destination
    exists` (a no-marker sibling alongside it IS swept)
  - `recovery skips a backup with a fresh marker and restores the newest
    abandoned one`
- **(b) a backup whose owner is gone - even if an unrelated process now holds
  that PID - is recovered when the destination is missing**
  - `a reused pid does not block recovery of a stale backup`: the marker is
    stale and the injected `isAlive` reports pid 777 alive (a different process),
    yet recovery takes the backup and it becomes the live runtime. This is the
    exact reported failure.
- **(c) a stale marker does not block recovery forever**
  - `a stale marker does not block recovery forever`: the first build sees a
    fresh marker and leaves the backup alone (destination stays missing); a later
    build past the lease recovers the SAME backup and publishes.
- Plus: `a backup with no ownership marker is recovered`;
  `a fresh marker whose owner pid is gone is abandoned` (tiebreaker);
  `a corrupt marker is owned while fresh and abandoned once its mtime ages`
  (the partial-write fallback);
  `a successful publish removes this build's ownership marker`.

## Verification (exact commands and results)

```
pnpm --filter @tuari/desktop test:packaging-security
  -> 46 tests: 45 pass, 1 skipped (platform: file symlinks not permitted), 0 fail
     (21 runtime-staging tests, including all nine marker tests above)

pnpm typecheck
  -> exit 0, 4 tasks successful; @tuari/desktop ran the --ephemeral waived build,
     logged the native-build skip, and left src-tauri/bin untouched

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
  reopen and read), which is parked. No local or unit test substitutes.
- The full `tauri build` / installer smoke run; the two #402 SQLCipher smoke
  checks have not run against a full packaging build.
- Residual ownership window, stated rather than hidden: a marker is fresh for up
  to the 30s lease, so a crash followed by pid reuse WITHIN that window still
  looks owned until the lease elapses. The swap is a few synchronous renames
  (well under the lease), so this is the crash-to-reuse race, not a normal
  overlap; staleness then resolves it and the machine is never left without a
  runtime permanently.
- Two builds can still race to publish the same destination (the loser fails its
  rename and restores its own backup). Out of scope for this finding.
