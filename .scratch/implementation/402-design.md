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
- `assertNotEncryptedWithoutKey(path, key)` — with no key configured and an
  existing, non-empty file that does not start with `SQLite format 3\0`, refuse
  with a message naming both possibilities (an encrypted workspace without the
  capability, or a damaged plaintext file) instead of the opaque first-query
  `file is not a database` (licensing architecture §8.3 downgrade case).

### Backups (#430/#470, unchanged shape)

The daily engine already copies with `VACUUM INTO` on a dedicated worker
connection and applies the key to both source and copy; the marker records
`encrypted`. The new proof is a test, not new production behaviour.

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
  - no key + plaintext SQLite file → opens;
  - no key + non-SQLite (encrypted-looking) file → refused with the clear message;
  - no key + missing/empty file → opens.
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
  plaintext artifact that claims encryption.
- The end-to-end native build is not proved on this workstation (missing Windows
  SDK). The gate, predicate, staging, and runtime refusal are proved by unit
  tests and by the (skipped-without-binding) encrypted backup test.
- Already-encrypted database without the capability: now refused up front with a
  clear message (was an opaque first-query failure).
- The 25 files ported here come from the previously reviewed `#409` branch
  (build gate + runtime verification, review rounds 1–5e); this lane rebases
  them onto current `origin/develop` and adds the encrypted-backup proof that
  the earlier lane recorded as uncovered (#410).
