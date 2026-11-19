# Windows release ZIP extraction

## Scope and evidence

- Worktree: `D:/worktrees/tuari_react_hono/t3-0782c1b8-1836bd2c290e019a`
- Base: `5249919c4d24e7ddb1d1f7c0dfea3b31099082b8`
- Mode: `focused-local / CI-final-enforced`; strict active ruleset `26837184`; required CI acceptance `15368`.
- Risk: Windows release verification and installer smoke both called `Expand-Archive`. The captured failure on run `44534647265` is the module's missing three-argument `ZipFile.ExtractToDirectory` overload, not a corrupt archive or absent executable.
- Captured ZIP SHA-256: `35b9312fc800bf4ff61cc1f38e318ade88190fabbaaeb82e59bc04e0ab84a7db`. The retained listing exits 0 and includes `./Tuari.exe`.
- The captured runner's archive module version was not recorded. On this implementation host, Windows PowerShell is `5.1.26100.9549`; installed `Microsoft.PowerShell.Archive` is `1.0.1.0`. Its loaded `System.IO.Compression.ZipFile` exposes `ExtractToDirectory(string, string)` and a three-argument overload that takes `Encoding`, but no `(string, string, bool)` overload. This matches the unsupported bool-call shape; it does not establish the runner's module version.

## Interface and choice

`scripts/extract-zip.ps1` accepts the archive path and an already-owned destination path. It loads the built-in `System.IO.Compression.FileSystem` assembly and calls the two-argument .NET extraction method. It does not overwrite existing files. Both callers create a fresh owned extraction directory, so no overwrite behavior is needed.

The verifier and installer smoke pass arguments to `powershell.exe -File` as an argument array. Paths are not interpolated into PowerShell source. Both callers use the same extraction adapter; non-Windows callers keep their existing `unzip` path. Native command results remain available to the verifier's diagnostics, including partial extracted-file inventory and the original extraction failure.

This interface is deeper than duplicating PowerShell command strings across callers: the compatibility choice and path handling live in one adapter. The Windows integration test executes that adapter under the installed Windows PowerShell and .NET, not a mock. A valid ZIP test fails if the adapter regresses to the unavailable three-argument method. Corrupt/empty ZIP and missing-executable cases remain separate verifier contracts.

## Test boundary

The local `Expand-Archive` invocation against the retained ZIP exited 0, so the exact captured module/runtime combination was not reproduced. The local installed `Microsoft.PowerShell.Archive` is `1.0.1.0`, but the captured runner's module version remains unknown. A separate PowerShell test asserts that the `(string, string, bool)` overload is absent and models the failing three-argument call; this local binder reports a bool-to-`Encoding` conversion error, not the runner's exact `Cannot find an overload` wording. The production adapter uses the supported two-argument overload and passed the retained ZIP through the actual verifier CLI, with a throwaway Ed25519-signed `.update` fixture. No owner key or release artifact was used.

Focused proof covers valid extraction and `Tuari.exe` presence/hash, malformed and empty ZIP rejection, missing executable rejection, quote/bracket paths, native diagnostics and signature verification. The production installer-smoke extraction path shares the adapter, but launching the app stays with the parent because its preflight port is `4318` and the worktree may share the machine.

## Hosted rerun correction

Greptile identified that strict extraction cannot overwrite resources left by `--extract-dir --force`. The reset helper now removes the supported owned outputs `Tuari.exe`, `bin`, `data` and `resources`, only when the smoke ownership marker exists. It retains unrelated files and the marker. A real Windows regression extracts an archive with resources, resets it, then extracts the same archive successfully again. An unowned-directory regression proves refusal without deleting the executable. Parent focused proof passed 26 cases without failures or skips in 8.74 seconds. Existing native portable launch proof is unchanged by this reset-only delta.

## Direct callers and exclusions

- `scripts/verify-release-assets.mjs` invokes the adapter for portable ZIP verification.
- `scripts/smoke/installer-smoke.mjs` invokes the same adapter before bundle inspection.
- No release signing, keys, versions, Node upgrade, dependency changes, workflow/guard changes, full build, browser run, app launch, publication, hosted review, or merge is in this worker scope.

Architecture: one shared extraction adapter replaces two PowerShell call sites; no other seam moves. Applied wisdom: `process/pass-powershell-scripts-by-file-across-bash.md`, used saved PowerShell files for shell probes and literal paths. No ZIP-specific desktop wisdom matched. Worker does not run local review sessions per the owner's instruction. Parent owns inspection and publication gates.
