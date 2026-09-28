# #402 / PR #409 - review round 3: cleanup reporting + encryption honesty

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `cc8684313026a5d2344be5cb698e1808a9335d23`
- previous code SHA (the round-3 findings were raised against): `848d20f500af5e542ad349a2ab9684edc11de3f4`
- evidence re-pinned to final code SHA: `3c20625eda463febdc7182fe94c03fb81a521fb8`
  (round 4, covered in
  `3c20625eda463febdc7182fe94c03fb81a521fb8-round4-findings.md`, changed
  `build-sidecar.mjs` waiver coverage and `runtime-staging.mjs` interrupted-swap
  recovery; the two findings this round fixed are unchanged)
- review tier: High-assurance (licensing/crypto + packaging)

The hosted Greptile review on PR #409 (round 3, 2026-09-28T00:08Z) raised four
inline findings against `848d20f`. This lane was assigned two of them:

1. `apps/desktop/scripts/runtime-staging.mjs:39` - **cleanup failure follows
   publication** (P2).
2. `apps/desktop/scripts/sqlcipher-availability.test.mjs:198` - **encryption
   lacks an end-to-end test** (P2).

The other two findings from the same round (`build-sidecar.mjs:229-235`
plaintext-waiver/usable-addon, `runtime-staging.mjs:20-25` interrupted swap)
were **not** touched by this lane; they are the parent's to route.

## Finding 1 - a post-publication cleanup failure must not read as a failed publish

**Finding.** `swapRuntimeDirectory` published the staged tree, then removed the
renamed-aside previous tree as its last statement. If that removal threw, the
error propagated through `buildProbeAndPublishRuntime` and `build-sidecar.mjs`
exited non-zero even though `src-tauri/bin` had already been replaced. Whoever
read the exit code would conclude the runtime was not replaced.

**Decision: warn and succeed** (not a distinct failure exit). The exit code's
meaning is "was the runtime published?"; after the successful swap the answer is
yes, and a failure exit would keep the exact misreading the finding describes --
the reader has to parse the message to learn the publish happened. The leftover
directory is inert (the new runtime is live), so the only correct signal is a
loud warning that names both states. A failure clearing a **stale** backup
before the swap stays fatal: nothing has been published at that point and the
rename would fail against a non-empty backup.

**Fix.** `runtime-staging.mjs`:

- `swapRuntimeDirectory` takes an injectable `warn` (default `console.warn`).
  The post-publish `remove` is wrapped in `try/catch`; on failure it warns with
  the live destination, the leftover path, the cause, and the explicit line
  `The runtime WAS replaced; this is cleanup-only, so the build is not failed.`
- The pre-swap stale-backup `remove` is deliberately outside that `try` and
  still throws.
- `buildProbeAndPublishRuntime` passes `warn` through; its JSDoc documents the
  asymmetry.

## Finding 2 - the tests proved plumbing, not encryption

**Finding.** The positive control uses a JavaScript stand-in that returns a
version string without encrypting anything, so it proves the probe plumbing,
not that the binding encrypts.

**Fix (a): reframe the test to claim only what it proves.**
`sqlcipher-availability.test.mjs`:

- The positive control is renamed from "a synthetic binding that reports a
  cipher version passes the real probe" to "**a synthetic binding that reports a
  cipher version proves the probe's plumbing, not encryption**", with its
  comment stating the boundary.
- The file gained a module-level coverage-boundary comment: the tests prove the
  loader path, package contents, and refusal paths only; a JavaScript stand-in
  cannot encrypt.

**Fix (b): state the real proof.** `docs/release-verification.md` gained a
"Real encryption is proven only by CI (#410)" section: real encryption is proven
only by the CI job tracked in #410, which builds the native fork, opens a
database with `PRAGMA key`, writes a row, asserts the file does not start with
`SQLite format 3`, then reopens it with the key and reads the row back. No local
test substitutes for it, and the sold `encrypted_db` guarantee stays unverified
end to end until that job is green. The smoke-test check description no longer
says the artifact "can genuinely encrypt", the smoke script header no longer
says it, and `docs/editions-and-features.md` no longer says a local check
"proves the binding encrypts".

**Fix (c): the cheap extra test.** New test "a synthetic binding whose
cipher_version comes back empty fails the real probe" drives the real spawned
Node against a synthetic package whose `pragma("cipher_version")` returns `""`,
covering the probe source's own `process.exit(3)` refusal (distinct from the
existing injected-`execFile` test of the wrapper's empty-stdout check).

## Verification (exact commands and results)

```
pnpm --filter @tuari/desktop test:packaging-security
  -> 28 tests: 27 pass, 1 skipped (platform: file symlinks not permitted), 0 fail
     new/renamed:
       - a failed cleanup after publication warns instead of failing the build
       - a failure clearing a stale backup before the swap still fails the build
       - a synthetic binding that reports a cipher version proves the probe's
         plumbing, not encryption (renamed)
       - a synthetic binding whose cipher_version comes back empty fails the
         real probe
     the warning test asserts: no throw; the staged runtime is live at
     destinationDir; the previous tree is still at backupDir; exactly one
     warning naming BOTH paths and containing "runtime WAS replaced" and
     "cleanup-only"; the staging tree is removed.

pnpm typecheck
  -> exit 0, 4 tasks successful; @tuari/desktop ran the --ephemeral sidecar
     build with the new buildProbeAndPublishRuntime signature and logged
     "Removed the ephemeral sidecar build; nothing was left in src-tauri/bin."

pnpm lint
  -> exit 0, 2 tasks successful; check:unslop PASS (1645 warn / 0 error)
```

Build-path exercises against the real repo state (the same two the round-2
evidence ran; `BIN_HASH` is a SHA-256 over every file under
`apps/desktop/src-tauri/bin` before and after):

```
1. Strict gate, no addon:
   pnpm --filter @tuari/desktop sidecar:build
   -> node-gyp cannot configure (no Windows SDK), the gate throws
      "SQLCipher is required to build the desktop artifact ..."
   -> EXIT=1
   -> BIN_HASH before == after == ecc5ad66c7c72447456cfbfb52d29336685cfcf6deceb440613fe902ccef5559
   -> no .bin-staging-* left behind

2. Synthetic addon that exists but cannot load:
   fake build/better_sqlite3.node + build/libeay32.dll in the resolved fork
   pnpm --filter @tuari/desktop sidecar:build
   -> "better-sqlite3-sqlcipher native binding found at ...better_sqlite3.node."
   -> the probe runs against the STAGED runtime
      (...\src-tauri\.bin-staging-ZxgDHp\node.exe and its staged node_modules)
      and fails: "... is not a valid Win32 application. code: 'ERR_DLOPEN_FAILED'"
   -> EXIT=1
   -> BIN_HASH before == after (same hash as exercise 1); the old runtime is
      intact and nothing half-published
   -> no .bin-staging-* left behind; the fake files were removed afterwards
```

`src-tauri/bin` was never modified by this lane's runs (the strict gate and the
failed probe both refuse before/at the swap). No tracked build-generated
artifacts were dirty at commit time.

## Coverage boundary - what this evidence does NOT prove

**Real encryption.** No test in this lane, and no local test at all, proves the
binding encrypts. The unit tests use JavaScript stand-ins; the smoke check loads
the fork but opens no keyed database. Real encryption is proven only by the CI
job tracked in **#410** (native fork build, write with a key, assert the file is
not `SQLite format 3`, reopen and read). No local test substitutes for it. This
statement is also now in `docs/release-verification.md`.

**Not proven on this host:**

- A real SQLCipher native build needs the Windows SDK; the positive probe path
  is exercised only with synthetic packages, and the real-fork refusal path with
  a file that cannot load.
- The full `tauri build` packaging run and the installer smoke run were not
  executed (they need a release build). The docs keep their 22/22 historical
  number and mark the two new SQLCipher smoke checks pending.
- The hosted Greptile verdict on this SHA does not exist yet; the parent
  requests the review after pushing. The local Greptile CLI quota for this
  account was already exhausted in round 1, so only the hosted review is the
  gate (per the brief).

## Commit

- `cc8684313026a5d2344be5cb698e1808a9335d23` - 7 files changed:
  `apps/desktop/scripts/runtime-staging.mjs`,
  `apps/desktop/scripts/runtime-staging.test.mjs`,
  `apps/desktop/scripts/sqlcipher-availability.test.mjs`,
  `scripts/smoke/installer-smoke.mjs` (header comment),
  `docs/editions-and-features.md`, `docs/release-verification.md`,
  `.scratch/implementation/402-design.md` (round-3 decision record).
- `eaf17268d65d053fae0a45fc194c41a4bea4149a` - the wisdom entry only
  (`.agents/wisdom/desktop-packaging.md`).
