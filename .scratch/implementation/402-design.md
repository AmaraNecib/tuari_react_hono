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
refusal prove the binding actually encrypts.

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
  SQLCipher PRAGMAs as no-ops, so this is what actually proves the binding
  encrypts rather than trusting `require()`.
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
