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

## Diagnostics UI integration

Recovered the stopped UI worker draft from t3-ab917421-91129994b2ebb7a9 into
this source-owning tree without changing the original draft. Settings now
wires a Diagnostics tab to typed native commands. The viewer shows only
allowlisted metadata and numeric correlation IDs through the shared formatter.
Load/save errors use correlated toast notifications without exposing native
exception strings. Missing logger state is unknown, not disabled. Empty event
lists and cancelled exports have explicit behavior.

Native contract: get_recent_diagnostic_events returns events and status.
Events carry occurredAt, level, category and errorId. Status carries enabled,
initialized, bufferedEventCount and droppedEventCount. export_support_bundle
returns saved with savedPath, or cancelled. The native side owns its save
dialog and path. This draft is not accepted as native integration proof.

Focused viewer tests cover RTL-isolated hexadecimal IDs, empty/cancelled
behavior and redacted failure notifications. Browser clips, element and
sidebar screenshots and owner signoff remain missing. Do not claim UI-ready.
The repository currently configures Arabic as its only supported language;
there is no English resource file. EN acceptance requires resolving that
existing product-language boundary, not silently changing global language
policy as part of a diagnostics screen.

## Browser-discovered routing correction

The first actual Playwright probe clicked Diagnostics but the account form
remained visible. The button existed, but the useUrlTab allowlist omitted
diagnostics. Add that tab to the URL state allowlist. The failed browser run
and video are preserved locally. The next run reached the Diagnostics heading;
its remaining failure was the probe expecting the definite article in the
Arabic heading, corrected by using the stable diagnostics-title locator.
These are distinct failed-attempt boundaries, not passing UI acceptance.

## Bounded review correction

Three distinct initial lenses completed at d9fcfef1 in order: debate,
test-audit, code-review. Test-audit found missing browser-runtime negative
coverage. Add a runtime-controlled test asserting that recordUiFailure returns
without invoking native IPC in the browser. Existing desktop emission and
logger rejection tests remain. This changes tests only, not runtime behavior.
One fresh combined-delta review follows the committed correction; unchanged
initial conclusions carry forward explicitly. All known acceptance blockers
remain open and are not waived by the local reviews.

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
