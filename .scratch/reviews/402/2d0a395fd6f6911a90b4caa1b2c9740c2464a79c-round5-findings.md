# #402 / PR #409 - review round 5: three fixes + one answered gap

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `2d0a395fd6f6911a90b4caa1b2c9740c2464a79c`
- previous code SHA (the round-5 findings were raised against): `e534c9ae57937f0c91d0e87a54ce4633d1323a2c`
- review tier: High-assurance (licensing/crypto + packaging)

The hosted review on `e534c9a` (2026-09-28T19:30Z) raised four inline findings.
Three are fixed here; the fourth is a known, documented gap that is answered
rather than faked. The earlier `runtime-staging.mjs:65-75` P2 from
2026-09-28T01:19Z ("overlapping builds steal active backups") is not one of the
four round-5 findings and is unchanged by this lane.

## Finding 1 (P1) - recovery restored the alphabetically-first backup, not the newest

**Finding** (`apps/desktop/scripts/runtime-staging.mjs:66`). With several
`bin.previous-*` backups and `bin` missing, recovery restored the first filename
in alphabetical order. For example `bin.previous-1000` sorts before
`bin.previous-999`, so an older runtime could become live.

**Fix.** Backups are named `<destination>.previous-<epochMs>-<pid>`.
`findPreviousRuntimeBackups` sorts by the parsed leading epoch (descending,
newest first) and recovery takes the first entry. `swapRuntimeDirectory` and
`buildProbeAndPublishRuntime` take an injectable `now`/`pid` so the name is
deterministic in tests. Legacy pid-only names parse as their own number and sort
before every timestamped backup, which is correct (they predate this build).

**Test.** `recovery restores the newest backup, not the alphabetically first`
seeds two backups whose alphabetical order is the reverse of their recency and
forces the publish rename to fail, then asserts the live runtime is the NEWER
tree and the older backup is untouched. `runtime-staging.mjs` and
`runtime-staging.test.mjs` were also updated for the new name format.

## Finding 2 (P2) - the waived ephemeral run still attempted a native build

**Finding** (`apps/desktop/scripts/build-sidecar.mjs:134`). `typecheck` passes
`--allow-plaintext --ephemeral` so it can run without a native toolchain, but a
missing addon still triggered `node-gyp rebuild` in the real dependency tree
before the waiver took effect.

**Fix.** The availability decision moved into a pure, injectable
`resolveSqlcipherArtifact({ packageDir, platform, plaintextAllowed, ephemeral,
exists, buildNative, log })` in `sqlcipher-availability.mjs`. It skips the
native build when the waiver is active AND the run is ephemeral; it still
attempts the build for a waived publishing run and whenever no waiver is active.
The banner is unchanged. `buildNative` is the real node-gyp driver in production
and a spy in the tests.

**Tests.** Five new tests assert the callback is never invoked on the skipped
path (not merely that a predicate returned false), that a waived publishing run
still attempts it, that no waiver always attempts it, that an available binding
never does, and that a failed build is captured in `detail` instead of thrown.

**Real build-path exercise.** `pnpm typecheck` runs the desktop `typecheck`
script, which runs the ephemeral waived sidecar build. Its output contains:

```
better-sqlite3-sqlcipher native binding missing (build\better_sqlite3.node,
build\libeay32.dll); skipping the native build for the waived ephemeral run,
which never publishes a runtime.
```

and contains no `node-gyp` / "Building better-sqlite3-sqlcipher native binding"
line, then the usual plaintext-only banner, and leaves
`apps/desktop/src-tauri/bin` untouched.

## Finding 3 (P2) - a damaged plaintext file was diagnosed as encrypted

**Finding** (`apps/api/src/infrastructure/database/factory.ts:85`). Any nonempty
file without the exact `SQLite format 3\0` header got an encryption-specific
error, so a truncated or corrupt plaintext database sent its operator to the
license/key instead of to the damaged data.

**Fix.** The message now names both possibilities without asserting either: the
file is either SQLCipher-encrypted (expected when no key is active) or damaged;
the build cannot tell them apart; and it says what to check in each case
(key/`encrypted_db` for the encrypted case, truncation/corruption for the
plaintext case). The same correction is applied to
`docs/licensing-architecture.md` and `docs/editions-and-features.md`.

**Test.** The existing refusal test now pins the absence of `almost certainly`
and the presence of `cannot tell those apart`, `damaged`, `truncated or corrupt`
and `inspect or restore it`, while keeping the
`SQLCipher-encrypted.*encrypted_db.*#402` contract.

## Finding 4 (P2) - "encryption remains untested" - ANSWERED, NOT FIXED

The finding is valid; the gap is real and already documented. The release check
(`probeSqlcipherBinding` / `inspectSqlcipherArtifact`) proves the copied addon
loads with the bundled Node and reports a non-empty `PRAGMA cipher_version`.
That distinguishes real SQLCipher from plain better-sqlite3, whose SQLCipher
PRAGMAs are no-ops. It does **not** prove that a keyed write encrypts the file.
A binding that reported a `cipher_version` while failing to encrypt would pass
the release gate.

Real encryption is proven only by the CI job tracked in
[#410](https://github.com/AmaraNecib/tuari_react_hono/issues/410): native fork
build, `PRAGMA key`, write a row, assert the file does not start with
`SQLite format 3`, reopen with the key and read the row back. This host has no
Windows SDK, so no local or unit test can substitute, and none is claimed.

Because a code comment must not overclaim, this lane also corrected the wording
(not the behaviour) in:

- `sqlcipher-availability.mjs` probe doc comment: "shows the binding is real
  SQLCipher rather than a no-op - it does NOT prove that a keyed write actually
  encrypts the file".
- `build-sidecar.mjs` `probeStagedRuntime` doc comment: "the strongest gate
  available without a native build toolchain ... not that a keyed write encrypts
  the file (that is the #410 CI job)".
- `factory.ts` `assertBindingEncrypts` doc comment: proves real SQLCipher, "it
  does not prove that a keyed write lands ciphertext on disk - the #410 CI job
  covers that end to end".
- `.scratch/implementation/402-design.md` Round 5 records the exact bound; the
  two earlier "proves the binding actually encrypts" phrasings are corrected in
  place.

`docs/release-verification.md` §"Real encryption is proven only by CI (#410)"
and `docs/editions-and-features.md` §6c already state this bound unchanged.

## Verification (exact commands and results)

```
pnpm --filter @tuari/desktop test:packaging-security
  -> 37 tests: 36 pass, 1 skipped (platform: file symlinks not permitted), 0 fail
     new/updated tests:
       - recovery restores the newest backup, not the alphabetically first
       - a waived ephemeral run does not attempt the SQLCipher native build
       - a waived publishing run still attempts the SQLCipher native build
       - without the waiver the SQLCipher native build is always attempted
       - an available binding never triggers a native build
       - a failed native build is reported in detail instead of thrown
       - a failed cleanup after publication warns ... (now pins the
         <epoch>-<pid> backup name)
       - a backup directory left by a crashed run is cleared ... (same)

pnpm --filter @tuari/contracts build && pnpm --filter @tuari/api test -- --maxWorkers=2
  -> 75 test files: 1363 pass, 1 skipped, 0 fail (the documented load-flaky
     sqlite-bootstrap write-lock skip)

pnpm typecheck
  -> exit 0, 4 tasks successful; @tuari/desktop ran the --ephemeral waived build,
     logged the "skipping the native build for the waived ephemeral run" line
     (no node-gyp), printed the plaintext-only banner, and left nothing in
     src-tauri/bin

pnpm lint
  -> exit 0, 2 packages successful; check:unslop PASS (1649 warn / 0 error)
```

## What stays unproven

- Real SQLCipher encryption: no local or unit test writes a keyed database and
  reads it back, and none can on this host. Proven only by the #410 CI job (and
  only once it is green against a built artifact).
- The full `tauri build` / installer smoke run. The two SQLCipher smoke checks
  added for #402 have not run against a full packaging build (see
  `docs/release-verification.md`).
- The earlier round-5 review also kept an unresolved P2 about overlapping builds
  stealing an active backup (`runtime-staging.mjs:65-75`); it is not part of
  this lane's brief and is unchanged.
