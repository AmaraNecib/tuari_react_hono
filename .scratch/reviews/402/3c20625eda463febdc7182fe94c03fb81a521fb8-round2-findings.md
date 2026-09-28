# #402 / PR #409 - review round 2: publish the runtime only after the probe passes

- mode: remote (parent owns push/PR; lane does not push or merge)
- branch: `fix/sqlcipher-fallback`
- base SHA (merge-base with `develop`): `183d2226ec50dab56a45d25fde6f72f319d5a267`
- reviewed code SHA: `f7b7efbee28fda6b11a1ccec10ac9b7e76716668`
- previous code SHA (the round-2 finding was raised against): `9aea1939db2ab78fa3de46b9d8b1c4e7b61da249`
- evidence re-pinned to final code SHA: `3c20625eda463febdc7182fe94c03fb81a521fb8`
  (later changes: round 3's post-publication cleanup reporting in
  `runtime-staging.mjs` and the probe tests/docs, plus round 4's waiver coverage
  and interrupted-swap recovery, all covered in the sibling round-3/round-4
  files. The build->probe->publish ordering this round introduced is unchanged.)
- review tier: High-assurance (licensing/crypto + packaging)

The branch was rebased onto `origin/develop` (`183d222`) before this round started;
the rebase rewrote the round-1 SHAs, and the re-pinned round-1 evidence is
`9aea1939db2ab78fa3de46b9d8b1c4e7b61da249-round1-findings.md`. The only rebase
conflict was the "current status" paragraph in `docs/release-verification.md`,
resolved by keeping develop's publish-gate text and re-attaching the SQLCipher
pending note.

## Finding (PR #409 review round 2)

The `cipher_version` probe ran after `buildRuntime` had already deleted the
previous `src-tauri/bin` runtime and copied the new files. When the addon existed
but could not load with the bundled Node, the build failed with the old runtime
already gone. A developer who had a working local runtime ended a failed run
with a broken one.

## Fix

`apps/desktop/scripts/runtime-staging.mjs` (new) adds two functions:

- `buildProbeAndPublishRuntime`: runs `build()`, then `probe()`, then publishes,
  with the staging tree removed on every path. Nothing is published unless the
  probe returns.
- `swapRuntimeDirectory`: renames the destination aside, renames the staging tree
  into place, and restores the destination if that rename fails. The staged tree
  never half-copies into the live directory.

`build-sidecar.mjs` now assembles the runtime in a staging directory. The
non-ephemeral staging directory is a sibling of `src-tauri/bin` (same volume, so
the rename is atomic) and is created with `mkdtempSync`, so a fresh tree is
written every run. The `cipher_version` probe moved out of `buildRuntime` into
`probeStagedRuntime`, which runs against the staged `node.exe` and staged
`node_modules`. The gate runs inside the build callback, before the swap.
`--ephemeral` builds, probes and discards as before.

The failure path is now: remove the staging tree, leave `src-tauri/bin` exactly
as it was, exit non-zero with the loader's own error.

## Verification

Scoped suite, then the build-path exercises.

```
pnpm --filter @tuari/desktop test:packaging-security
  -> 25 tests: 24 pass, 1 skipped (platform), 0 fail
     6 of those are the new runtime-staging tests:
       - a successful probe publishes the staged runtime and removes staging
       - a failed probe leaves the previous runtime byte-for-byte intact
       - a failed build never reaches the probe and leaves the previous runtime intact
       - a failure while swapping restores the previous runtime
       - an ephemeral build probes and discards without touching the destination
       - a backup left by a crashed run is cleared before the next swap
     "byte-for-byte intact" is a SHA-256 over the whole tree, not a single file.

pnpm lint
  -> 2 tasks successful (check:unslop and the other checks passed first)

pnpm --filter @tuari/contracts build && pnpm typecheck
  -> 4 tasks successful; @tuari/desktop ran the ephemeral sidecar build
     ("Removed the ephemeral sidecar build; nothing was left in src-tauri/bin.")
     then cargo check, so the --ephemeral path still works after the change.
```

Build-path exercises, run against the real repo state. `src-tauri/bin` held a
generated runtime at the start; the hash before/after is a SHA-256 over the whole
tree and the node_modules fake was removed afterwards.

```
1. Strict gate, no addon:
   pnpm --filter @tuari/desktop sidecar:build
   -> node-gyp fails to configure (no Windows SDK), gate throws
      "SQLCipher is required to build the desktop artifact ..."
   -> exit 1
   -> BIN_HASH before == after (8c777077...94e), no .bin-staging-* left

2. Synthetic addon that exists but cannot load:
   fake build/better_sqlite3.node + build/libeay32.dll in the resolved fork
   pnpm --filter @tuari/desktop sidecar:build
   -> "native binding found at ...better_sqlite3.node."
   -> probe runs against ...\src-tauri\.bin-staging-8fCoLP\node.exe and fails
      "SQLCipher binding could not be loaded ... is not a valid Win32 application.
       { code: 'ERR_DLOPEN_FAILED' }"
   -> exit 1
   -> BIN_HASH before == after, no .bin-staging-* left

3. Synthetic addon that loads (positive control):
   fake addon plus a lib/index.js that reports a cipher version
   pnpm --filter @tuari/desktop sidecar:build
   -> "Verified the bundled Node runtime loads the SQLCipher binding
       (cipher_version 4.5.6 synthetic)."
   -> "Local API runtime ready at ...\src-tauri\bin\api-runtime"
   -> exit 0
   -> BIN_HASH changed, better-sqlite3-sqlcipher present in the published
      runtime, no .bin-staging-* and no bin.previous-* left
   -> src-tauri/bin and the fork package were restored from a backup afterwards
```

Tracked build-generated artifacts (`apps/desktop/src-tauri/gen/schemas/*`) were
regenerated by the typecheck `cargo check` and restored to HEAD before staging.

## Not proven on this host

- A real SQLCipher native build needs the Windows SDK. Exercises 2 and 3 prove
  the probe and the publish ordering with a synthetic addon, not a real fork
  binary loaded by the bundled Node.
- The full `tauri build` packaging run and the installer smoke run were not
  executed; they need a release build.
- The local Greptile CLI was not run (account quota exhausted, and the brief
  makes the hosted PR review the gate). This round has no Greptile verdict of its
  own; the parent decides whether to re-request the hosted review.

## Commit

- `f7b7efbee28fda6b11a1ccec10ac9b7e76716668` - 3 files changed:
  `apps/desktop/scripts/build-sidecar.mjs`,
  `apps/desktop/scripts/runtime-staging.mjs` (new),
  `apps/desktop/scripts/runtime-staging.test.mjs` (new).
- `4744e0104f677ce13645b1cfd4a67211df40501f` - the wisdom entry only.
