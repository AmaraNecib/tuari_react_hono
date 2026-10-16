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
(`apps/desktop/src-tauri/src/lib.rs:2147`), so a customer who bought encrypted
storage got an artifact that cannot honour the guarantee — silently.

Four defects made the fallback unconditional:

1. **The fork's addon is never built by pnpm.** `pnpm-workspace.yaml`
   `onlyBuiltDependencies` omits `better-sqlite3-sqlcipher`, and
   `pnpm rebuild <pkg>` does not run the fork's implicit node-gyp build.
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
  3\0` file, refuse (opening it under a key would corrupt it or silently defeat
  at-rest encryption); with no key and a non-SQLite file, refuse with a message
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
evidence is `.scratch/reviews/402/e76946ee-*.md`. No hard blockers. Fixed here:

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
  introduced here.
- **`APP_DB_KEY` empty-string and `readSync` failure paths (test-audit #3/#4).**
  Edge cases, no behaviour change proposed.
