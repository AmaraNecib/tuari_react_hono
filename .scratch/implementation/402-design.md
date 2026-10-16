# #402 — Never silently ship or open an unencrypted database

- mode: remote
- ticket: #402 `bug` — "build-sidecar silently ships without SQLCipher while
  APP_DB_KEY is set (encrypted_db licenses get a plain DB)"
- worktree: `worktrees/fix-encryption-fallback`
- branch: `fix/402-encryption-fallback`
- base ref: `origin/develop`
- base SHA: `ec369a303301fb61259a61c532753fea723d75fd`
- review tier: **High-assurance** (licensing / crypto / packaging)

## Problem

`apps/desktop/scripts/build-sidecar.mjs` fell back to a plain `better-sqlite3`
runtime with a `console.warn` and exit code 0 when the SQLCipher binding was
unavailable. The shipped artifact is edition-agnostic and the shell sets
`APP_DB_KEY` whenever the signed licence carries `encrypted_db`
(`apps/desktop/src-tauri/src/lib.rs:2148`), so a customer who bought encrypted
storage got an artifact that cannot honour the guarantee — silently.

Four defects made the fallback unconditional:

1. **The fork's addon is never built by pnpm.** The package ships no
   `install`/`postinstall` script, so pnpm has nothing to run — adding it to
   `onlyBuiltDependencies` would change nothing — and `pnpm rebuild <pkg>` does
   not drive node-gyp either.
2. **The availability check looked at the wrong path.** The fork's loader
   requires `build/better_sqlite3.node`; the old check looked at
   `build/Release/better_sqlite3.node`, which is *plain* better-sqlite3's layout.
3. **The SQLCipher branch was not self-contained.** The API bundle statically
   imports plain `better-sqlite3`, and the fork's `lib/index.js` requires
   `integer`; neither was copied on the SQLCipher branch.
4. **The fallback was only a warning.** Exit 0, no artifact-visible signal.

## Decision: fail the build, verify at runtime, prove the backup

The desktop artifact is one binary for every edition, so an artifact without the
capability can never honour an `encrypted_db` licence. The build is the earliest,
cheapest place to catch that. Runtime refusal is kept as **defence in depth**:
the API proves the loaded binding actually encrypts before it opens a keyed
database, so even a mis-built bundle cannot write plaintext under a key.

`--allow-plaintext` (or `TUARI_ALLOW_PLAINTEXT_DB=1`) is an explicit developer
override. It prints a loud banner, and the release scripts never pass it.
`typecheck` passes `--allow-plaintext --ephemeral`: the runtime is assembled in a
throwaway temp directory and removed, so a plaintext runtime never lands in
`src-tauri/bin` where a later `tauri build` could package it.
`tauri.conf.json`'s `beforeBuildCommand` re-runs the **strict** sidecar build, so
`tauri build` (however invoked) either rewrites `bin/` with a verified runtime or
fails.

## Changed contracts

### `apps/desktop/scripts/sqlcipher-availability.mjs` (new, pure)

```js
requiredSqlcipherFiles(platform) -> string[]                 // addon (+ libeay32.dll on win32)
inspectSqlcipherArtifact({ packageDir, platform, exists })
  -> { available, binaryPath, missing }
resolveSqlcipherArtifact({ packageDir, platform, plaintextAllowed, ephemeral,
                           exists, buildNative, log })
  -> { availability, attemptedBuild, detail }
probeSqlcipherBinding({ nodeExecPath, runtimeDir, execFile })
  -> cipherVersion                                            // throws when unloadable
```

`inspectSqlcipherArtifact` is the single predicate for "SQLCipher available".
`probeSqlcipherBinding` runs the copied fork with the **copied** Node and
requires a non-empty `PRAGMA cipher_version`; existence alone accepts a
stale/wrong-ABI addon that would fail on a customer machine.

### `apps/desktop/scripts/runtime-staging.mjs` (new)

`buildProbeAndPublishRuntime({ stagingDir, destinationDir, publish, build, probe })`
assembles the runtime in staging, runs `probe`, and only then renames it into
`src-tauri/bin` (atomically, same volume). A refused gate or a failed probe
leaves the previous runtime intact; abandoned staging/backup trees from a crashed
build are recovered by pid + process start time, not a name sort.

### `apps/desktop/scripts/build-sidecar.mjs`

- Resolve + inspect SQLCipher **before** touching `bin/`; on missing, attempt a
  real `node-gyp rebuild` of the fork (pinned `node-gyp` devDependency).
- Still missing and not waived → **throw** (non-zero exit).
- Always copy plain `better-sqlite3` + `bindings` + `file-uri-to-path` (the bundle
  always needs it); when SQLCipher is available also copy
  `better-sqlite3-sqlcipher` + `integer`.
- Probe the staged runtime with the bundled Node; only publish on success.

### `apps/api/src/infrastructure/database/factory.ts`

- `resolveDatabaseConstructor(key, loadSqlcipher?)` — injectable loader seam,
  clearer error, underlying error preserved.
- `assertBindingEncrypts(sqlite)` — after `PRAGMA key`, require a non-empty
  `PRAGMA cipher_version`; otherwise close the connection and throw. Plain
  better-sqlite3 treats the SQLCipher PRAGMAs as no-ops, so this is what proves
  the binding encrypts rather than trusting `require()`.
- `assertDatabaseFileMatchesKey(path, key)` — one rule for both directions of
  the header check (#402): with a key configured and a plaintext `SQLite format
  3\0` file, refuse (SQLCipher rejects it under a key, and opening it would
  silence the at-rest guarantee); with no key and a non-SQLite file, refuse with
  a message
  naming both possibilities (an encrypted workspace without the capability, or a
  damaged plaintext file) instead of the opaque first-query `file is not a
  database` (licensing architecture §8.3 downgrade case). A missing or empty file
  opens either way.

### Backups (#430/#470, unchanged shape)

The daily engine already copies with `VACUUM INTO` on a dedicated worker
connection and applies the key to both source and copy; the marker records
`encrypted`. The new proof is a test, not new production behaviour. It is the
backup-path guard (also valuable to #430/#470) as much as a #402 guard; the
native job in #410 is what runs it.

## Tests

- `apps/desktop/scripts/sqlcipher-availability.test.mjs` (`node --test`): the
  fork's loader path is `build/better_sqlite3.node`; `build/Release` is **not**
  accepted; the Windows `libeay32.dll` requirement; the native-build decision
  (including that a waived ephemeral run never drives node-gyp); the probe
  wrapper (loader stderr, empty version).
- `apps/desktop/scripts/runtime-staging.test.mjs` (`node --test`): build →
  probe → publish ordering; a refused gate/failed probe preserves the previous
  runtime; abandoned-tree recovery; ownership by pid + start time.
- `apps/api/src/infrastructure/database/factory.test.ts` (vitest):
  - key + non-encrypting binding (plain `better-sqlite3`) → refused, connection
    closed, message names the binding;
  - key + binding that reports a `cipher_version` → accepted;
  - key + plaintext `SQLite format 3\0` file → refused (the keyed direction);
  - no key + plaintext SQLite file → opens;
  - no key + non-SQLite (encrypted-looking) file → refused with the clear message;
  - no key + truncated 1–15-byte file → refused (damage is a named possibility);
  - no key + missing/empty file → opens.
- `apps/desktop/scripts/sqlcipher-availability.test.mjs` also pins
  `isReleaseBuild` and `sqlcipherGateDecision`, including that a release build
  (`CI` / `NODE_ENV=production`) can never waive SQLCipher however the waiver
  was requested.
- `apps/api/src/modules/backup/backup.encrypted.test.ts` (vitest, **runs only
  when the SQLCipher native binding is present**): a keyed database backs up to a
  file that (a) does not start with `SQLite format 3`, (b) reopens with the key
  and reads a row back, and (c) fails to open without the key. The service-level
  case also asserts the dated folder + `encrypted: true` marker and that the
  status stays clean.
  This workspace has node-gyp but **no Windows SDK**, so the native fork cannot
  be built here; the file is `describe.skipIf`-gated and is the executable
  coverage that #410's native CI job is meant to run.

## Risks / notes

- A release build now fails when SQLCipher cannot be produced. That is intended:
  it forces the toolchain to be fixed before shipping, instead of shipping a
  plaintext artifact that claims encryption. The plaintext waiver is refused
  outright in a release build (`CI` / `NODE_ENV=production`), so the env var
  cannot leak a plaintext artifact out of CI either.
- The end-to-end native build is not proved on this workstation (missing Windows
  SDK). The gate, predicate, staging, and runtime refusal are proved by unit
  tests and by the (skipped-without-binding) encrypted backup test.
- Already-encrypted database without the capability: now refused up front with a
  clear message (was an opaque first-query failure).
- The files ported here come from the previously reviewed `#409` branch
  (build gate + runtime verification, review rounds 1–5e); this lane rebases
  them onto current `origin/develop` and adds the encrypted-backup proof that
  the earlier lane recorded as uncovered (#410).

## Round 2 — gate findings (review at `e76946ee`)

`debate`, `code-review`, `test-audit`, and the design pass ran at `e76946ee`;
that round's two evidence files were superseded by the `7620322b` review below
and are no longer kept in `.scratch/reviews/402/` — the findings in this section
are their record. No hard blockers. Fixed here:

- **Keyed direction of the header rule (design pass #1).** The first version
  only refused a non-SQLite file when NO key was set, so a plaintext file opened
  with `APP_DB_KEY` still failed with an opaque first-query error. Requirement 2
  names the file must not start with `SQLite format 3`, so
  `assertDatabaseFileMatchesKey` now checks both directions and
  `createDatabaseConnection` refuses a plaintext file under a key.
- **Release waiver (code-review M2).** `TUARI_ALLOW_PLAINTEXT_DB=1` could waive
  a release build. `isReleaseBuild` (`CI` / `NODE_ENV=production`) is now passed
  to a pure `sqlcipherGateDecision`; a release returns `refuse-release` however
  the waiver was requested, and the staged-runtime probe is fatal there too.
- **Gate logic untested (test-audit #1).** The decision is now a pure function
  with tests for all four outcomes and for the release predicate.
- **Packaging tests never run in CI (test-audit H1 / code-review N1).**
  `@tuari/desktop` gains a `test` script and `ci.yml`'s lint job runs
  `test:packaging-security` (the job already runs other root-level gates turbo
  skips).
- **Truncated plaintext DB untested (test-audit #2).** Added a 5-byte-file case.
- **Staging leftovers ungitignored (debate C4 / code-review L2).**
  `.bin-staging-*` and `bin.previous-*` are ignored now.
- **Overstated comment (code-review L3).** `assertBindingEncrypts` says “no
  plaintext content”, not “no plaintext file”.

Deferred to their own issues (not silently):

- **#410** — the native CI job that builds the fork and runs
  `backup.encrypted.test.ts` for real, and that must FAIL when the binding is
  absent rather than skip (test-audit H2).
- **`portable:only` / hand-built plaintext `bin/` (debate C9).** The release
  path (`build`, `tauri build` beforeBuildCommand) always re-runs the strict
  gate; only the low-level `portable:only` escape hatch can zip a `bin/` a human
  previously built with the waiver. A guard there needs a plaintext-runtime
  detector in `build-portable.mjs` — owner decision requested.
- **Duplicated cipher-rule sites (code-review L1) and the worker's keyed open
  without a probe (design pass #2, pre-existing #430).** Low drift risk; not
  introduced here. (The worker probe was pulled forward in round 3 — see below.)
- **`APP_DB_KEY` empty-string and `readSync` failure paths (test-audit #3/#4).**
  Edge cases, no behaviour change proposed.

## Round 3 — review at `7620322b`

`design pass`, `debate` (critic + defender), `test-audit`, and `code-review` ran
in fresh contexts at `7620322b`. No blockers; the diff already met #402's
acceptance criteria. Fixed here:

- **Header rule untested through its production call site (test-audit H1).**
  `factory.test.ts` now drives `createDatabaseConnection` over a real file path
  in both directions and asserts the constructor is never reached on the
  refused keyed path — delete the call and the test fails.
- **Release waiver re-derived at the staged-runtime probe (design pass #1,
  code-review).** `sqlcipherPlaintextWaiver({plaintextAllowed, release})` is now
  the ONE definition; `sqlcipherGateDecision`, `resolveSqlcipher`, and
  `probeStagedRuntime` all call it, and the predicate has its own tests.
- **The probe subprocess had no timeout (debate H4).** A hung `node.exe` would
  block both the build and the installer smoke gate; the bound is now part of
  the contract and asserted in the probe test.
- **A truncated file under a key fell through to an opaque first-query error
  (test-audit M1).** A file shorter than any database header is refused as
  damaged, and the case is pinned by a test.
- **The backup worker claimed `encrypted: true` without proving it (debate
  H2/H3, code-review Standards).** The worker now requires a non-empty
  `PRAGMA cipher_version` before it writes, and takes the key already escaped by
  the exported `escapeSqliteString` instead of an inline copy of the rule.
- **A silent skip would hide a broken native build (test-audit H4).**
  `backup.encrypted.test.ts` gains a `TUARI_REQUIRE_SQLCIPHER=1` sentinel that
  FAILS in the #410 job when the binding is absent.
- **Unsupported "corrupt it" claim (debate M1).** The refusal message, the doc,
  and the design no longer assert corruption; SQLCipher rejects the file.
- **The release refusal dropped the remedy (debate M4) and the plaintext advice
  did not name the release case (code-review).** Both messages now state the fix.
- **The design record's root cause #1 was wrong (debate H5).** The fork ships no
  `install`/`postinstall` script, so `onlyBuiltDependencies` was never the fix;
  the doc and the `build-sidecar.mjs` comment say so.
- **Duplicated npm script and an off-by-one doc citation (code-review).**
  `@tuari/desktop`'s `test` now delegates to `test:packaging-security`;
  `docs/editions-and-features.md` cites `lib.rs:2148`.

Dismissed with a cited reason (not silently):

- **`isReleaseBuild` treats any non-empty `CI` as release (debate M4).** It
  fails closed in the safe direction; "CI=0 means local" is not a contract.
- **`createDatabaseConnection(path, null)` no longer means "plaintext" (debate
  M5).** The `dbKey ?? process.env.APP_DB_KEY ?? null` chain is unchanged; `null`
  always meant "fall back to the environment".
- **The `--ephemeral` gate can never refuse (debate M2).** The refusing gate is
  the release build, whose `beforeBuildCommand` re-runs the strict path;
  `typecheck` deliberately assembles into a temp dir and publishes nothing.
- **`build-sidecar.mjs` still cannot be imported by a test (test-audit H2/H3
  remainder).** Lifting the whole build into an injected function would churn a
  300-line side-effecting script; the incremental step is the single shared
  predicate plus the wiring assertions in `factory.test.ts`.

Still deferred (recorded, not silent):

- **#410** — the native CI job. It must set `TUARI_REQUIRE_SQLCIPHER=1` so the
  sentinel above fails instead of skipping.
- **`portable:only` plaintext zip and `APP_DB_KEY=""`** — unchanged from round 2.
- **`installer-smoke.mjs` docstring enumeration ordering (debate L1)** — the
  header lists themes, not the code order; cosmetic, and the checks themselves
  are correct.

## Round 4 — confirmation at `583f1ffe`

`design pass`, `debate` (critic + defender), `test-audit`, and `code-review` ran
again in fresh contexts at `583f1ffe`. All four round-3 objections were confirmed
closed: the probe timeout, the backup worker's capability probe, the corrected
`onlyBuiltDependencies` root cause, and the sentinel's mechanism. Findings left
by that round, fixed here:

- **The worker's capability probe had no executed test on any host (test-audit).**
  `createWorkerSnapshotter` now takes a `resolveDriverModule` injection seam, and
  `backup.snapshot.test.ts` drives the worker with a fake driver that reports no
  `cipher_version` (refused) and one that does (accepted). This is the revert
  detector for the probe; the real native proof stays #410's.
- **The keyless wiring test depended on the ambient environment (debate N1).**
  It passes `""` instead of `null`, which falls through to `APP_DB_KEY`.
- **A leftover `lib.rs:2147` citation (code-review).** Corrected to 2148.
- **Evidence freshness (code-review S1).** This round's evidence is committed at
  its own HEAD; the earlier `e76946ee` pair stays removed because it described a
  superseded commit.

Still deferred, unchanged: **#410** (and the `TUARI_REQUIRE_SQLCIPHER=1`
trigger it must set), `portable:only`, and `APP_DB_KEY=""`. The
`build-sidecar.mjs` call sites of `sqlcipherPlaintextWaiver` are
wiring-inspected rather than unit-tested because the script runs at import; both
call sites are behaviourally identical to the pre-round-3 code.
