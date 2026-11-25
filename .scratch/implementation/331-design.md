# Offline diagnostics dashboard

Worktree: D:/worktrees/tuari_react_hono/t3-1779debe-5a135c0b143ecfba.
Base: ddad58b75bc3abe6676adb23ca6b508cf2ca4d65. Issue #331 read with gh issue view.
Mode: focused-local / CI-final-enforced, supplied by parent. Cached activation docs still say pending; this worker does not assert independent protection inspection. Parent owns that gate.
Review: three initial lenses, parent-owned. Risks include incorrect event identity, misleading counts and disclosure of redacted data.

## Design

Owner-approved report layout with the main project's neutral surfaces and terracotta actions, restrained serif headings and monospace timestamps. Four views retain a visible offline label. Desktop and 390px mobile share controls. No fonts, images or remote assets are requested.

A record's count represents occurrences. Its identity is its original array index, not its signature or error code. Codes may repeat, so lookup returns all matches. Context uses the complete chronological stream, not filtered results. Day filters use UTC explicitly; displayed timestamps retain producer offsets.

Grouping uses #330 sanitized signatures. Arbitrary messages remain redacted. Version and OS describe the bundle manifest, not inferred event provenance. Missing metadata says Unavailable. The shared PRODUCT_PREFIX remains in pipeline.mjs and reaches the UI through report-data.

The model module owns chronology, grouping, lookup and context. Deleting it would duplicate rules across views. React reads only the sanitized embedded copy, identical to report-data.json. Vite compiles React to a classic IIFE and report.css. Local classic scripts avoid file:// ES-module and fetch restrictions. CSP forbids external connections and inline script/style. Exclusive creation and identity-checked rollback now include CSS.

Build tools resolve from pinned apps/web dependencies. VIEWER_DEPENDENCY_ROOT is a local verification override for an already installed workspace. No downloads, lock changes or writes to that workspace. Emitted reports need no server or node_modules; generating them requires the existing React/Vite dependencies.

## Palette alignment

Palette correction base: be7d03d55c2c9b81a18f2f7af58ec23bf21e9b20.
Owner approved the existing dimensions and requested the main project palette.
The CSS maps every consumed color to local tokens copied from
apps/web/src/styles.css, not an import of the full application stylesheet.
Canvas is #fafafa, sidebar #f4f4f4, ink #171717, muted #595959, brand and
keyboard ring #b4502a, selected event #f0e0d3. Semantic error and success
colors follow the project. Warning text uses darker #765510 for small-text
contrast; its border and surface retain project #b08020 and #f3e9cf.
No network, dependencies, state, layout, typography or domain contracts change.
Architecture: no seam moved. CSS tokens are local presentation details.
The changed manifest is this design note, dashboard.css and its existing
browser test. Three initial lenses remain parent-owned under the supplied mode.

Browser proof now asserts real computed colors, text contrast and the keyboard
ring on file:// output, plus the existing four-view interactions and privacy
checks. Laptop video holds each main view for five seconds when explicitly
enabled; normal test runs have no recording delays. A normalized CSS comparison
against the palette base checks that all non-color declarations are unchanged.
No matching wisdom was found for palette, contrast, offline or telemetry.
Impeccable context found no PRODUCT.md; existing source provides the scoped
context. The skill's referenced product.md is absent in this checkout.

## Proof and limits

Failing-first import saved in .scratch/reviews/331/model-red.log. Model/parser tests cover counts, chronology, filters, metadata absence, lookup collisions, context, redaction and output collisions. Browser proof uses installed Edge and Playwright with synthetic sanitized data, offline mode, all four views, desktop/mobile, screenshots and request/error capture. Continuous clips include the old report before the dashboard. Bounded Vite compilation is necessary to prove local file execution.

No full suites, production data, publication, new packages or child delegation. Parent owns appearance approval, independent reviews and hosted CI. Wisdom search found no matching telemetry/offline/redaction lesson. No glossary meaning changed. No wisdom written.
