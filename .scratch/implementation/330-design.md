# Telemetry Viewer Design (#330)

Anchor: #330 (CLI + parser + report pipeline). Companion: #331 (dashboard views). Consumers of the #324 event schema and #325 bundle shape. ADR: `docs/adr/ADR-DIAG-001.md`.

## Why (problem)

The maintainer receives support bundles (or picks up a USB stick) and currently has no way to read them. Raw JSONL is unreadable at scale. The viewer turns a bundle/folder into a shareable, readable diagnostics report — one command, one HTML file.

## Decisions (from the grilling session)

### D1 — Audience & shell: local dev tool, UI-agnostic core

Only the maintainer reads bundles today. The tool runs locally — zero hosting, zero auth; the data never leaves the machine **until the report is shared**, which is why the pipeline carries an explicit redaction seam (D7) before emission. The parse→render core is UI-agnostic so it can later back the #327 ingest review surface without rework.

### D2 — Input: folder tree + zip, folder-first

`tuari-viewer <folder> -o report.html` and `tuari-viewer <bundle.zip> -o report.html`. A zip is the logs folder tree compressed → unzip to temp, parse as a folder. Folder-first parsing makes zip support nearly free. When a `manifest.json` is present (per #325), read product/version/OS/build/timestamps from it instead of guessing.

### D3 — Output: one entry static HTML + sidecar data

`report.html` (entry) + reusable shell `report.js` + `report-data.json` (this bundle's data, split out when volume is large). Opens from `file://` — no server. React via the vite build (maintainer's preferred stack, static output). Shareable: attach to issues, archive.

### D4 — Views v1 (#331): 1–4 only

1. Overview header (product, version, OS, build, date, event count, days covered)
2. Error signatures (grouped by signature: count, first/last seen, versions/OS, by frequency)
3. Timeline (filter by day/level/signature; click error → surrounding context)
4. Error-code lookup (paste `PREFIX-XXXXXXXX` → jump to event + context)

Cut: slow-ops + lifecycle markers (may fall out as timeline filters), trend charts, cross-bundle comparison, live-tail, server features.

### D5 — Product prefix is one constant

`PREFIX-XXXXXXXX` error codes: the prefix is a single build-time constant read by app and viewer; resolution matches on the numeric ID, prefix-agnostic. A future product rename (TUARI is a placeholder) is a one-line change; old codes still resolve.

### D6 — Naming

- CLI: `tuari-viewer` (internal, renameable anytime)
- Input artifact: **support bundle** (zip, per #325)
- Output artifact: **diagnostics report** (report.html)
- Error code: `PREFIX-XXXXXXXX`; numeric ID is the stable identifier

### D7 — Redaction before emission (shareable report = data leaves the machine)

Local processing is not a privacy surface by itself, but the report is explicitly **shareable** (attach to an issue, send to a colleague) — so the pipeline runs a **redactor between the parser and the emitter**, with the same semantics as the #326 sanitizer: drop user IDs, file paths, SQL bindings, tokens, headers, and non-essential event attributes before writing `report-data.json`/`report.html`. The input bundle is already redacted at #325 (never DB, never secrets), but error-message payloads and log attributes can still embed customer data (names, paths, machine details). `report-data.json` must never contain data that #326 promised would never leave the device.

## Seam / testing strategy

Three seams in #330's pipeline: the **parser** (folder tree / zip → normalized event model; fixtures + tests: day-folder layout, chunk files `app.1.log`, truncated trailing line, manifest read), the **redactor** (normalized model → redacted model; fixtures with embedded paths/user IDs/SQL/headers assert they are stripped from the output model), and the **emitter** (redacted model → report.html + sidecar; assert one-entry output, sidecar split behavior, and that the emitted data contains no redaction-list tokens). #331's seam is the **data-shaping** layer the views consume (signature grouping, timeline filters, code lookup) — tested without a browser.

## Prior art / existing infrastructure

- `apps/api` sidecar built with tsup (proven pattern for packaging Node in this repo)
- Repo is a pnpm workspace; `apps/` holds runnable apps; `tools/` holds loose scripts (viewer goes in `apps/viewer`, package `@tuari/viewer`)
- #324 defines the event schema the parser consumes; #325 defines the bundle shape (manifest.json added to #325)
- No CONTEXT.md existed before this effort — created alongside (glossary only)

## Out of scope

- #327 ingest server review surface (same core, later)
- Trend charts, cross-bundle comparison, live-tail
- User-facing diagnostics (that's #325, in-app)
- Anything network/server-side in the viewer
