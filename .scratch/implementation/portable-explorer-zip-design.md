# Portable ZIP entries for Windows Explorer

## Scope and proof mode

Worktree: `D:/worktrees/tuari_react_hono/t3-c4901929-29f113d6d4bfd287`
Base: `origin/develop` at `6f8e0249e40df9ad3b1f891b3181030422251028`
Verification: `focused-local / CI-final-enforced`, strict active ruleset `26837184`, app `15368`, no bypass.
Review tier: high assurance for a release artifact compatibility defect. Owner authorized one Greptile review plus light parent inspection instead of three local review sessions. Parent owns publication, CI/hosted gates and merge.

## Confirmed defect

The portable ZIP exists, matches the GitHub asset digest, and contains 170 entries, but Windows Explorer's `Shell.Application.Namespace(...).Items()` returns zero. A minimal ZIP with `./` and `./Tuari.exe` reproduces the empty Shell view. The same archive without the `./` root entry shows `Tuari.exe`. `build-portable.mjs` currently asks trusted Windows `tar.exe` to archive `.` from the portable directory, which emits those dot-root entries. Independent extractors still read the ZIP, so ZIP magic, hash, native runtime checks and extraction do not prove Explorer compatibility.

## Interface and decision

The packager's interface is the portable directory plus its output ZIP. Keep trusted `tar.exe`, `shell: false`, encryption proof-before-publication, rename recovery and prior-ZIP preservation. Enumerate the known finalized root entries (`Tuari.exe`, `bin`, optional `resources`), reject any other top-level entry, then pass those literal names after `-C <dir> --`. This produces relative paths without a dot-root entry and protects names beginning with `-` from option parsing. Do not flatten the tree or build a recursive argument list.

The Windows Shell check is an adapter at the produced-artifact seam. It opens the actual ZIP with `Shell.Application`, rejects a null or empty namespace, and requires `Tuari.exe`, `bin` and `resources` at the archive root. The portable packaging test also checks ZIP paths, executable/runtime/resource contents, and invokes the same Shell check on Windows. Nightly runs the check immediately after packaging and before signing or publication. The other release channels use the same packager, but the requested remote enforcement is limited to the normal nightly path.

## Single artifact identity

Hosted review found that the new Shell check chose the newest ZIP while manifest creation and staging still chose the first ZIP. Nightly now selects once in the Shell step, exports its successful path through the step output, and uses that exact path for checksum, size and staging. A workflow regression rejects downstream reselection and asserts the shared path. Parent focused workflow tests passed 11/11; actionlint passed. The archive implementation and prior Windows Shell/runtime proof are unchanged by this wiring correction.

## Failure caught and limits

The old packaging invocation can pass archive signature checks, hash verification, extraction and native-runtime proof while Explorer presents an empty archive. The Windows COM regression catches that exact failure against the production packager fixture; nightly applies it to the actual generated ZIP. Linux skips COM explicitly, so a skipped local test is not a Shell pass. No exact native executable or owner Downloads path is needed for the fixture proof.

Architecture: the archive command remains an internal implementation detail; no module seam moved. Applied wisdom: desktop packaging lesson about proving behavior on the built artifact, checked against this confirmed archive-specific failure. No new package or dependency changes.
