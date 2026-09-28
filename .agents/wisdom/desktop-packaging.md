# Desktop packaging wisdom

## `env_clear()` on the sidecar child drops `SystemRoot`, and the bundled Node aborts without it (🔴 Major)

The first end-to-end launch of the built portable artifact exposed a defect that
no source test could catch. `spawn_api_process` in
`apps/desktop/src-tauri/src/lib.rs` spawns the sidecar with
`command.env_clear()` plus a small allowlist. The bundled Node 22.23.2 aborts
during `InitializeOncePerProcessInternal`:

```
Assertion failed: ncrypto::CSPRNG(nullptr, 0)
```

`Tuari.exe` then exits with code 101 after its 15 second API wait, and the app
never serves. The abort text lands in `<root>/data/logs/api-server.log`.

Isolation, run against the extracted bundle: launching `bin/node.exe` with
`bin/api-runtime/dist/index.cjs` and exactly the shell's allowlist reproduces the
abort. Adding `SystemRoot=C:\WINDOWS` makes it start and bind. `windir`, `PATH`,
and `TEMP` do not. `scripts/smoke/sidecar-env-repro.ps1` runs that matrix.

Fixed on the `test/installer-smoke` branch by re-setting `SystemRoot` from the
parent environment for the sidecar child on Windows after `env_clear()`.

**Always**: when a desktop shell spawns a bundled runtime with a cleared
environment, restore the variables that runtime's own dependencies need. On
Windows, `SystemRoot` is load-bearing for the OpenSSL CSPRNG seeding Node runs at
startup. `env_clear()` is right for not leaking the parent's secrets, but it
cannot be the whole story for a child runtime.

## Tauri's `resource_dir()` carries the `\\?\` prefix, and Node cannot use it as the main script (🔴 Major)

The same launch hid a second blocker. With `SystemRoot` restored, the sidecar got
one step further and died in Node's CommonJS main-module resolution:

```
Error: EISDIR: illegal operation on a directory, lstat 'C:'
    at toRealPath (node:internal/modules/helpers:61:13)
    at Function._findPath (node:internal/modules/cjs/loader:760:22)
```

Tauri's `resource_dir()` returns a `\\?\`-prefixed path on Windows, and the
shell passed `runtime_dir/dist/index.cjs` through unmodified. The prefix is fine
for `CreateProcess` (the exe loads) but breaks `path.resolve` + `realpathSync` in
the loader for the script argument.

Fixed on the `test/installer-smoke` branch with
`strip_windows_extended_path_prefix` in `lib.rs`, a pure helper covered by a unit
test for verbatim drive, verbatim UNC, and plain paths.

**Always**: strip the Windows extended-length prefix (`\\?\`) before handing a
Tauri path to a child process as a script argument. And when two startup
blockers stack, fix and re-run rather than declaring victory after the first one:
the CSPRNG abort in the first defect masked this one entirely.

## Legacy migration preserves mtime, so a file-existence check proves nothing (🟠 Major)

`ensure_runtime_files` migrates an allowlisted legacy database from
`Documents/Tuari` (or `%PUBLIC%\Documents\Tuari`) into the data dir with
`std::fs::copy`, which preserves the source timestamp. A "the app created the
database" assertion that only tests for the file passes on a migrated copy that
is months old, so the smoke test can go green while the sidecar never ran.

**Always**: when proving an app created state, compare the file mtime against the
run start, not just existence. Same rule for any check that a crashed process
could satisfy through a repair or migration path.

## A probe that runs after the destructive step is not a gate (🟠 Major)

PR #409 round 1 added a real `cipher_version` load probe to `build-sidecar.mjs`,
but it ran after `buildRuntime` had already deleted `src-tauri/bin` and copied
the new tree. When the addon existed but could not load with the bundled Node,
the build failed with the previous runtime already gone, so a developer who had a
working local runtime ended the run with a broken one. The gate stopped the
artifact but destroyed the workspace on the way.

`apps/desktop/scripts/runtime-staging.mjs` fixes the order. The runtime is built
into a staging directory (`mkdtempSync` beside `src-tauri/bin`, same volume so
the final rename is atomic), the probe runs against the staged `node.exe` and
staged `node_modules`, and only then does the directory swap into place. The
previous tree is renamed aside first and restored if the swap fails, so no path
leaves a half-copied runtime.

**Always**: a validation step that can reject the new artifact must run BEFORE
anything replaces the old one. If the check needs the artifact on disk, build it
in a staging directory and publish on success. "Gate first" applies to the
destructive step too, not just to the write gate.

## Cleanup after a publish must not invert the publish's exit code (🟠 Major)

PR #409 round 3: `swapRuntimeDirectory` renamed the staged runtime into
`src-tauri/bin`, then removed the renamed-aside previous tree as its last
statement. When that removal threw (a locked file on Windows is enough), the
error propagated and `build-sidecar.mjs` exited non-zero, but the new runtime was
already live. Anyone reading the exit code concluded the previous runtime was
still in place, the opposite of what happened.

The post-publish removal now runs in a `try/catch` that warns with the live
destination, the leftover path and the cause, and the build succeeds. The
stale-backup removal BEFORE the swap stays fatal: at that point nothing has been
published and the rename would fail against a non-empty backup.

**Always**: split the failure handling of a publish at the point of no return.
Before it, a failed step must fail the operation; after it, the operation has
succeeded and any later failure is a warning that names the resulting state
(what is live, what is left behind). One code path that treats both the same
will eventually report the wrong outcome.

## An escape hatch must cover every failure mode it exists for (🟠 Major)

PR #409 round 4: `--allow-plaintext` only guarded the build-sidecar availability
gate (the addon file missing). An addon that existed at the loader path but could
not load with the bundled Node passed the gate and then failed the staged probe,
so a waived build (including the `--ephemeral` typecheck path) still exited
non-zero. The waiver looked supported and then blocked the builds it existed for.

The staged probe now catches the load failure: without the waiver it rethrows,
with it the same loud plaintext-only banner prints, naming the probe error and
the fact that the runtime cannot encrypt, and the build publishes.

**Always**: when adding an opt-out, enumerate every refusal the code path can
produce and decide explicitly which ones it covers. Test the matrix
(failure mode × waiver on/off); an escape hatch that covers one of two failure
modes is a trap.

## A swap that renames the old tree aside must recover its own interrupted run (🟠 Major)

PR #409 round 4: `swapRuntimeDirectory` renamed `src-tauri/bin` aside, then
renamed the staged tree into place. A run killed between those two renames left
no `bin` and a `bin.previous-<pid>` backup. The next build found no destination,
so it published normally but never restored or cleared the backup: recovery
depended on the destination already existing, and only a human deleting
directories could clean it up.

The swap now scans for `<dir>.previous-*` siblings. If the destination is missing
and one exists, it restores it first (logging the state it found and what it
did) and then runs the normal swap. Restoring before publishing is what makes
the publish-failure path safe: the catch restores a runnable runtime instead of
leaving nothing. Older backups are swept after the next successful publish.

**Always**: a multi-rename publish must recognize the state its own crash window
leaves behind (missing destination plus a backup) and repair it on the next run.
Recovery that assumes the destination exists is not recovery, and the stranded
state should be restored before republishing so even a failed retry leaves
something runnable.
