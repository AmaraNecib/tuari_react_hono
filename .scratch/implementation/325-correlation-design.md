# Issue #325 local diagnostics correlation

## Scope and authority

Worktree: D:/worktrees/tuari_react_hono/t3-2e942fb4-d3841aa6725fe658.
Base: 3e79ae5b. Branch: feat/325-local-diagnostics.
Mode: focused-local / CI-final-pending. No publication or merge authority.
High-assurance review applies because diagnostic records must not leak secrets.
Three distinct initial review lenses remain required after complete integration.

The recovery preserved existing toast and error-correlation source and tests.
The native worker's original tree is t3-286a3cbb-8d0267f6ba44626c and remains untouched.
New native and UI implementation use separate visible isolated workers.

## Vocabulary and interface

An error ID is an unsigned 32-bit numeric identifier. An error code is its
uppercase eight-digit hexadecimal presentation with the single TUARI prefix.
Resolution accepts another product prefix and returns the numeric ID.
This is a support correlation hint, not an authentication token or unique key.
Random IDs can collide and support must also consult event timestamps.

The toast caller supplies its existing React message. The shared toast module
adds the code and records only the numeric ID through record_ui_failure.
UI text, business data and exception payloads never cross this command.
Browser-only runtime skips native logging. Logging failure is swallowed to
avoid recursive notifications. Successful notifications remain unchanged.

The formatting/recording seam is shared with the Diagnostics viewer and error
fallbacks. Deleting it would duplicate numeric formatting and native failure
handling across callers. The native adapter owns local persistence.

## Proof and remaining gates

Preserved expected-red evidence lives in .scratch/reviews/325/correlation-red.log
and toast-red.log. Recovery focused proof covers format and prefix-independent
resolution, numeric-only native arguments, logger rejection, correlated toast
rendering and unchanged success behavior. Runtime native/browser integration,
UI clips and screenshots, owner signoff, and independent review remain separate
gates. Toast coverage alone does not establish every failure across the app.

Initial web typecheck failed because generated contracts declarations were
absent. A scoped contracts build is required for the affected web typecheck,
not justification for a full production build or suite. Preserve the failed log.
Current develop protection inspection returned HTTP 404 Branch not protected;
local proof does not establish hosted CI acceptance or protection enforcement.

## ZIP boundary

No native ZIP dependency is declared. Existing Windows packaging uses trusted
System32 tar.exe. That does not establish a cross-platform runtime contract.
The release script's JavaScript ZIP writer is not directly callable from Rust.
No new dependency or custom native ZIP implementation is approved by this note.
The bundle must exclude databases and secrets, include manifest metadata, and
retain the day-folder JSONL layout with explicitly sanitized event fields.

## Wisdom

Applied the PowerShell-by-file lesson: no interpolated PowerShell commands or
cleanup. Missing generated contracts are checked before treating cascading
TypeScript diagnostics as application regressions. No wisdom files changed.
