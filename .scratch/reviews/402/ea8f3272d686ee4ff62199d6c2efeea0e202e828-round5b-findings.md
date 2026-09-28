# #402 / PR #409 - round 5b: overlapping builds must not steal an active backup

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `ea8f3272d686ee4ff62199d6c2efeea0e202e828`
- previous code SHA (round-5 three fixes + answer): `2d0a395fd6f6911a90b4caa1b2c9740c2464a79c`
- review tier: High-assurance (licensing/crypto + packaging)

Parent decision after round 5: fix the still-open P2 "overlapping builds steal
active backups" (`runtime-staging.mjs:65-75`) before the next push, so the review
does not re-raise it. It is in the same file the round-5 findings touched.

## Finding - two builds can steal each other's in-flight backup

**Finding** (hosted review 2026-09-28T01:19Z, still open on `e534c9a`). One
build renames `bin` aside to `bin.previous-<...>` before publishing. A second
build running at the same time sees `bin` missing and treats the first build's
in-flight backup as stranded: recovery can rename it back to `bin`, or the sweep
can delete it. The first build then loses the tree it needs to roll back its
publish, so a failed build cannot restore the previous runtime.

## Fix - touch a backup only when its owner is provably gone

The backup name already carries the owner pid
(`<dest>.previous-<epochMs>-<pid>`). `isAbandonedBackup(ownerPid, { isAlive,
pid })` is now the ownership gate, applied in `findAbandonedRuntimeBackups`
BEFORE the recency sort, so both recovery and the post-publish sweep only ever
see abandoned backups:

- **`ownerPid === our pid` -> abandoned.** A pid names one live process, so a
  backup carrying OUR pid cannot belong to a concurrent build. It is litter from
  an earlier incarnation (a crash, or the pid reused after a reboot) and recovery
  may take it even though the pid is "alive" because it is us.
- **any other pid -> abandoned only when `isAlive(ownerPid)` is false.** The
  default probe is `process.kill(pid, 0)`: `ESRCH` means gone, `EPERM` means the
  process exists but may not be signalled (still alive).
- **unparseable owner -> never abandoned.** A tree we cannot prove is dead must
  stay, or a concurrent publishing build would lose its rollback backup.

`isAlive` is injectable on `swapRuntimeDirectory` and
`buildProbeAndPublishRuntime`, so the rule is unit-tested without spawning
processes. The pre-existing `remove(backupDir)` before the swap is still safe:
its name contains our own pid, so no other live process can own it.

## Tests (all in `runtime-staging.test.mjs`)

- `a backup owned by a live process is not restored when the destination is
  missing` - the live build's backup stays put, no recovery log is emitted, and
  the staged runtime is published.
- `a backup owned by a live process is not swept when the destination exists` -
  the live backup survives the sweep while a dead-pid sibling alongside it is
  still cleaned up.
- `recovery skips a live-pid backup and restores the newest abandoned one` - a
  NEWER live-pid backup is ignored in favour of an OLDER dead-pid one.
- `a backup named with this process's own pid is recoverable` - own-pid litter
  from a prior incarnation is still recovered.
- `a legacy pid-only backup is recovered when its owner is gone` - the legacy
  name format still parses, is judged by its pid, and is recovered.

The four earlier recovery/sweep tests now inject `isAlive: () => false` so they
do not depend on a real pid being dead.

## Verification (exact commands and results)

```
pnpm --filter @tuari/desktop test:packaging-security
  -> 42 tests: 41 pass, 1 skipped (platform: file symlinks not permitted), 0 fail

pnpm typecheck
  -> exit 0, 4 tasks successful; @tuari/desktop ran the --ephemeral waived build,
     logged "skipping the native build for the waived ephemeral run", left
     src-tauri/bin untouched

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
  reopen and read). No Windows SDK on this host, so no local test replaces it.
- The full `tauri build` / installer smoke run; the two #402 SQLCipher smoke
  checks have not run against a full packaging build.
- Two-build races that this finding does not cover: two builds can still race to
  publish the same destination (the loser fails its rename and restores its own
  backup), and a pid reused by an unrelated live process blocks that backup's
  recovery/sweep (conservative: left rather than stolen). Both are out of scope
  for this finding; stated so they are not misread as solved.
