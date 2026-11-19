# Nightly verifier failure evidence

## Scope and authority

- Base: `f66acaf78a18893b51921352adc832d02a5a537e`, the supplied parent fix branch base.
- Worktree: `D:/worktrees/tuari_react_hono/t3-434f7b76-e5f4e5af52ea5bbd`.
- Verification mode: `focused-local / CI-final-enforced`, strict active ruleset `26837184`, app `15368`, no bypass. Hosted current-head checks and Greptile 5/5 remain parent-owned merge gates.
- Risk: high. This changes the mandatory Windows Nightly release verifier and its artifact handling.
- Owner approval: the owner explicitly authorized this instrumentation, failed portable ZIP retention, and one normal Nightly only after the production gates pass.
- Publication, hosted review, merge, dispatch, monitoring, and production release remain parent-owned. No children or local reviews are requested for this lane.

## Failure and unknown cause

Normal Nightly run `44520207731` at `f66acaf` packaged successfully and passed encryption proof and signature verification, then failed after `Expand-Archive` with `Portable zip does not contain Tuari.exe`. It did not retain the ZIP. Artifact-only run `44524887394` at `24832195` succeeded with a producer file of 13,187,584 bytes and central entry `./Tuari.exe`; original and strict PowerShell extraction both exited zero, produced 140 files including the app, and this attempt had no Defender 1116/1117 event. That does not establish the original cause, implicate antivirus, or prove a fix.

## Design

Keep the actual verification contract unchanged: the selected portable ZIP must be extracted, and the extracted tree must contain `Tuari.exe`; the signed update manifest, version, channel, and signature checks remain mandatory. Add an optional `--diagnostics-dir` CLI argument. The verifier records the selected archive's absolute path, byte size and SHA-256, source/run identity, archive-list command and result, actual extraction command and result, stdout/stderr, and extracted executable inventory before removing its temporary extraction tree. Failed command details must remain distinct from a missing executable. A checked-in PowerShell file receives paths as process arguments and sets terminating error behavior so `Expand-Archive` errors cannot silently pass.

The Nightly caller supplies a dedicated runner-temp diagnostics path. On job failure, a narrowly scoped capture step copies only the known portable ZIP candidates and verifier diagnostic directory into a three-day artifact. Upload uses the existing pinned `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02`. Evidence steps do not replace or soften verifier, encryption, signature, or installer smoke failures. No private key, environment dump, generic runner-temp contents, database, or runtime tree is uploaded. No speculative packaging workaround or skipped check is in scope.

## Test boundaries and proof

Exercise the real CLI and real system ZIP listing/extraction. Use throwaway Ed25519 keys for the existing signature path. Cover a valid ZIP, missing executable, invalid/empty ZIP, persistent diagnostic records on extraction failure, and argument-safe paths. The local Windows run exercises the actual PowerShell helper and empty-ZIP failure behavior, including the nonterminating-error guard. Workflow tests pin diagnostics wiring, failure-only bounded artifact capture, pinned upload action, retention, and unchanged smoke/publish ordering. Run focused Node tests, actionlint if installed, PowerShell syntax checks if an installed parser is available, and `git diff --check`. No full build, browser run, or hosted run.

Parent integration uses a unique extraction directory for each CLI execution. A stale `.verify-tmp/Tuari.exe` fixture must not satisfy an archive missing the executable. The producer evidence filter includes both `Tuari-portable.zip` and the existing `Tuari-portable-new.zip` fallback. Parent focused execution passed 18 tests with no skips in 7.54 seconds; actionlint, Node syntax and whitespace checks passed. These changes prevent misleading verification and preserve evidence; they do not identify the original missing-file cause.

## Architecture

The verifier CLI is the caller-facing seam. Optional diagnostics add evidence without changing existing Beta/Release calls. The PowerShell helper is the Windows extraction adapter; its parameters carry paths without embedding them in a script string. The archive listing remains an independent observation, never a substitute for extraction. `architecture: no seam moved`.

## Applied wisdom

- `.agents/wisdom/process/pass-powershell-scripts-by-file-across-bash.md`: keep PowerShell in a file, pass absolute paths as arguments, and stop on errors.
- `.agents/wisdom/testing/phantom-test-failures-after-dependency-bumps-stale-node-modules-per-checkout-worktree.md`: no dependency changes are in scope; test the supplied installed toolchain as-is.
- `.agents/wisdom/desktop/legacy-migration-preserves-mtime-so-a-file-existence-check-proves-nothing.md`: preserve the real extracted-file check; a ZIP entry or file existence elsewhere is not launch proof.
