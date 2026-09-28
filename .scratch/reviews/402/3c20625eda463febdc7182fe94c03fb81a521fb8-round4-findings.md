# #402 / PR #409 - review round 4: waiver coverage + interrupted-swap recovery

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `0bcf7e7d17f3814f9e913c562930e8125b48875d`
- previous code SHA (the round-4 findings were raised against): `848d20f500af5e542ad349a2ab9684edc11de3f4`
- evidence re-pinned to final code SHA: `3c20625eda463febdc7182fe94c03fb81a521fb8`
  (the wisdom entry landed after the code commit; the reviewed code is unchanged)
- review tier: High-assurance (licensing/crypto + packaging)

The PR #409 review round 3 (2026-09-28T00:08Z) raised four inline findings. The
lane fixed two in round 3 (round-3 evidence). The parent then approved picking up
the remaining two before the next push; this file covers them.

## Finding 1 - the plaintext waiver must cover an unloadable addon

**Finding** (`apps/desktop/scripts/build-sidecar.mjs:229-235`). The staged
`cipher_version` probe ran whenever the addon file existed, so an addon that is
present but cannot load with the bundled Node failed the build even with
`--allow-plaintext` / `TUARI_ALLOW_PLAINTEXT_DB=1`. The waiver guarded only the
missing-addon gate, which made it look like a supported path and then block the
builds it exists for (including `typecheck`, which uses `--allow-plaintext`).

**Fix.** The banner moved into `printPlaintextOnlyWarning(detail)` and
`probeStagedRuntime` now catches the probe failure: without the waiver it
rethrows (strict behaviour unchanged), with the waiver it prints the same loud
banner, naming the probe error as the reason, and lets the build publish. The
banner gained the explicit line `The runtime cannot encrypt a database.` next to
the existing `encrypted_db`-refusal and "never ship this artifact" text. The
waiver stays strictly opt-in; release scripts still never pass it.

With a broken addon present, the published runtime's keyed path is refused
cleanly: `resolveDatabaseConstructor` wraps the loader failure as "Database
encryption requires better-sqlite3-sqlcipher, which is not installed or cannot
be loaded", so the banner's claim holds for this artifact too.

## Finding 2 - an interrupted swap must recover its own state

**Finding** (`apps/desktop/scripts/runtime-staging.mjs:20-25`). A run killed
between `rename(destinationDir, backupDir)` and
`rename(stagingDir, destinationDir)` left no destination plus a
`destinationDir.previous-<pid>` backup. The next build saw no destination, so it
published normally but never restored or cleared the stranded backup: recovery
depended on the destination already existing, and a human deleting directories
was the only cleanup.

**Fix.** `swapRuntimeDirectory` scans the destination's parent for
`<basename>.previous-*` siblings. When the destination is missing and one
exists, it restores that backup first (logging both the state it found and what
it did) and then runs the normal swap.

Restore-first was chosen over "publish and clear" because the publish-rename
catch then restores a runnable runtime instead of leaving nothing, so the
interrupted state is repaired even when the retry fails. It also consolidates
the backup naming: a crashed run cannot accumulate stranded directories, because
the next run's swap renames the recovered tree to its own current-pid backup and
removes it. Backups left by older interrupted runs are swept after the next
successful publish, under the same warn-don't-fail policy as the post-publication
cleanup (round 3). `readdir` and `log` are injectable so all three paths are
unit-tested.

## Verification (exact commands and results)

```
pnpm --filter @tuari/desktop test:packaging-security
  -> 31 tests: 30 pass, 1 skipped (platform: file symlinks not permitted), 0 fail
     round-4 recovery tests:
       - a runtime left aside by an interrupted run is restored before the next swap
         (asserts the staged runtime is live, the stranded tree is gone, no
          .previous-* remains, and one log names the stranded path + destination
          and says "Restoring")
       - a failed publish after recovery leaves the interrupted run's runtime in place
         (4 renames: recover, aside, publish fails, restore; asserts the stranded
          tree's hash is the live destination afterwards)
       - a backup left by an interrupted run is swept when the next publish succeeds

pnpm typecheck
  -> exit 0, 4 tasks successful; @tuari/desktop ran the --ephemeral waived build,
     printed the plaintext-only banner + "The runtime cannot encrypt a database.",
     and left nothing in src-tauri/bin

pnpm lint
  -> exit 0, 2 tasks successful; check:unslop PASS (1645 warn / 0 error)
```

Build-path matrix, against the real repo state. `BIN_HASH` is a digest over every
file under `apps/desktop/src-tauri/bin` before/after each exercise. The real
`src-tauri/bin` was parked in a temp directory for exercises 2-4 and restored
byte-for-byte afterwards (final hash equals the starting hash).

```
H0 (real runtime) = ecc5ad66c7c72447456cfbfb52d29336685cfcf6deceb440613fe902ccef5559

EX1 - no addon, no waiver:            pnpm --filter @tuari/desktop sidecar:build
  -> exit 1 with "SQLCipher is required ..."; BIN_HASH unchanged; no staging tree

EX2 - no addon, waiver (TUARI_ALLOW_PLAINTEXT_DB=1), destination missing plus a
      stranded bin.previous-999999 from a simulated interrupted run
  -> exit 0
  -> "Found no published runtime at ...\src-tauri\bin, and an interrupted run
      left one aside at ...\bin.previous-999999."
  -> "Restoring ...\bin.previous-999999 before publishing the staged runtime, so
      a failed publish still leaves a runnable runtime."
  -> "WARNING: building a PLAINTEXT-ONLY desktop artifact." +
     "The runtime cannot encrypt a database."
  -> published runtime has no SQLCipher fork (plaintext build); no .previous-*
     left; no staging tree left
  -> H2 = 787c27286a8c4c1005692ec9e4a7f056971429b6011637f405fc22e67d7fc155

EX3 - unloadable synthetic addon, no waiver:
      pnpm --filter @tuari/desktop sidecar:build
  -> gate logs "native binding found"; probe fails against the staged node.exe
     (ERR_DLOPEN_FAILED); exit 1
  -> BIN_HASH unchanged (H2); no staging tree left

EX4 - unloadable synthetic addon, waiver via --allow-plaintext:
      pnpm --filter @tuari/desktop sidecar:build -- --allow-plaintext
  -> exit 0
  -> "WARNING: building a PLAINTEXT-ONLY desktop artifact." with
     "Reason: the SQLCipher binding is present but the bundled Node cannot load
     it (...)" and "The runtime cannot encrypt a database."
  -> published runtime contains the fork package (inert for the no-key path; a
     keyed open refuses cleanly); no staging tree, no .previous-*

Restore: fake addon files removed (fork build dir back to empty), exercise
runtime deleted, parked bin restored -> hash == H0.
```

`git status` is clean apart from the intended changes; no tracked
build-generated artifacts were modified.

## Coverage boundary - what stays unproven

**Real encryption** is proven only by the CI job tracked in **#410** (build the
native SQLCipher fork, write a row through a keyed connection, assert the file
does not start with `SQLite format 3`, then reopen with the key and read the row
back). No local or unit test substitutes for it; the JavaScript stand-ins
cannot encrypt. `docs/release-verification.md` states this.

Not proven on this host:

- A real SQLCipher native build (no Windows SDK). The waiver paths are exercised
  with a synthetic addon that cannot load; the positive real-fork load path is
  not.
- The real `tauri build` packaging run and the installer smoke run.
- The interrupted-swap recovery is exercised with a hand-made stranded backup
  and in unit tests, not by killing a real build mid-swap (that window cannot be
  forced deterministically on Windows).
- The hosted Greptile verdict on the new head does not exist yet; the parent
  requests it after pushing (the local CLI quota is exhausted).

## Commit

- `0bcf7e7d17f3814f9e913c562930e8125b48875d` - 6 files changed:
  `apps/desktop/scripts/build-sidecar.mjs`,
  `apps/desktop/scripts/runtime-staging.mjs`,
  `apps/desktop/scripts/runtime-staging.test.mjs`,
  `docs/editions-and-features.md`, `docs/release-verification.md`,
  `.scratch/implementation/402-design.md` (round-4 decision record).
- `3c20625eda463febdc7182fe94c03fb81a521fb8` - the wisdom entries only
  (`.agents/wisdom/desktop-packaging.md`).
