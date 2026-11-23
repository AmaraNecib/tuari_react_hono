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

