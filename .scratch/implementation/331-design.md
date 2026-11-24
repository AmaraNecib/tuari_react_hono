# Offline diagnostics dashboard

Worktree: D:/worktrees/tuari_react_hono/t3-1779debe-5a135c0b143ecfba.
Base: ddad58b75bc3abe6676adb23ca6b508cf2ca4d65. Issue #331 read with gh issue view.
Mode: focused-local / CI-final-enforced, supplied by parent. Cached activation docs still say pending; this worker does not assert independent protection inspection. Parent owns that gate.
Review: three initial lenses, parent-owned. Risks include incorrect event identity, misleading counts and disclosure of redacted data.

## Design

Industrial report layout, forest-green navigation and warm paper content, restrained serif headings and monospace timestamps. Four views retain a visible offline label. Desktop and 390px mobile share controls. No fonts, images or remote assets are requested.

A record's count represents occurrences. Its identity is its original array index, not its signature or error code. Codes may repeat, so lookup returns all matches. Context uses the complete chronological stream, not filtered results. Day filters use UTC explicitly; displayed timestamps retain producer offsets.

Grouping uses #330 sanitized signatures. Arbitrary messages remain redacted. Version and OS describe the bundle manifest, not inferred event provenance. Missing metadata says Unavailable. The shared PRODUCT_PREFIX remains in pipeline.mjs and reaches the UI through report-data.

The model module owns chronology, grouping, lookup and context. Deleting it would duplicate rules across views. React reads only the sanitized embedded copy, identical to report-data.json. Vite compiles React to a classic IIFE and report.css. Local classic scripts avoid file:// ES-module and fetch restrictions. CSP forbids external connections and inline script/style. Exclusive creation and identity-checked rollback now include CSS.

Build tools resolve from pinned apps/web dependencies. VIEWER_DEPENDENCY_ROOT is a local verification override for an already installed workspace. No downloads, lock changes or writes to that workspace. Emitted reports need no server or node_modules; generating them requires the existing React/Vite dependencies.

## Proof and limits

Failing-first import saved in .scratch/reviews/331/model-red.log. Model/parser tests cover counts, chronology, filters, metadata absence, lookup collisions, context, redaction and output collisions. Browser proof uses installed Edge and Playwright with synthetic sanitized data, offline mode, all four views, desktop/mobile, screenshots and request/error capture. Continuous clips include the old report before the dashboard. Bounded Vite compilation is necessary to prove local file execution.

No full suites, production data, publication, new packages or child delegation. Parent owns appearance approval, independent reviews and hosted CI. Wisdom search found no matching telemetry/offline/redaction lesson. No glossary meaning changed. No wisdom written.
