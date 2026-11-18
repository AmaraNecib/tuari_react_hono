# Desktop development child PATH

## Scope and pinned state

- Owned tree: `D:/worktrees/tuari_react_hono/t3-d5a68276-97285353df356c66`
- Checkout HEAD at start: `8ca0d5b28c368911360a3518c81f940efd5ddeef`
- Requested base: `faf17f76c47088119179f35864b8326e63549655`
- Actual merge base: `e8e759277ffc4c56fa744030fca40312c8ab5d8b`; the requested base is not an ancestor of this checkout.
- Verification mode: `focused-local / CI-final-enforced`, as supplied by the parent. This is not a hosted verdict for this head.
- Review tier: high-assurance. The child environment carries credentials and runtime secrets.
- Local-only. No push, PR, merge, dependency change or user-tree edit.

At checkout, three unrelated user changes were already present in `apps/desktop/src-tauri/Cargo.toml` and the generated desktop and Windows schemas. They remain untouched and will not be staged.

## Finding and design

In `spawn_api_process`, both debug and release commands used `env_clear()`. The debug branch starts `pnpm.cmd`, whose Windows shim resolves `node` through `PATH`. Clearing `PATH` makes the API process exit with the reported Windows message. A local PowerShell reproduction and a focused Rust process-launch test both demonstrate this failure.

Keep the production allowlist. The shared environment setup clears inherited values, retains the existing Windows `SystemRoot` exception, and forwards only `PATH` for debug launches. Release launches the bundled Node by absolute path and receive no inherited `PATH`. Existing explicit API configuration and secret variables remain set after this policy function. The test launches a shell that resolves `node` through the configured child environment and separately checks that a production-mode child receives neither `PATH` nor an arbitrary injected secret.

`TEMP` and `TMP` were not changed. The observed failure is command lookup, and the isolated `PATH` probe turns red on the exact `'node' is not recognized` message.

## Module and seam

`configure_api_child_environment` is an internal process-environment seam used by the real API launcher and tests. Its contract is small: clear parent variables, preserve `SystemRoot` on Windows, and forward `PATH` only when the caller selects development mode. No domain glossary change or external interface moved.

Applied wisdom: `desktop/env-clear-on-the-sidecar-child-drops-systemroot-and-the-bundled-node-aborts-without-it`, retaining `SystemRoot` while adding the separately demonstrated debug-only PATH requirement. Applied `architecture/desktop-settings-ride-the-config-file-the-shell-already-forwards` by not adding unrelated configuration variables. Excluded unrelated path, database, packaging and test-environment lessons.

## Proof boundary

The initial standalone probe returned exit 1 with the owner's exact `'node' is not recognized as an internal or external command, operable program or batch file.` output after clearing PATH. The failing-first Rust test reproduced the same message before the fix. Post-fix proof must run that test and the production isolation test at the committed head. Native desktop launch, full Rust tests/build, CI acceptance, and hosted review are not claimed. Raw local logs belong under ignored `.scratch/reviews/desktop-dev-node-path/`.
