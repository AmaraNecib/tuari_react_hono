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

## Implementation scope at #618 base

# Local diagnostics pipeline

Base fa29d60368ba566227ebb47a83f6f5cf6983a5be. Issue #330 only, not dashboard #331 or producer/error UI. Assigned tree D:/worktrees/tuari_react_hono/t3-1779debe-5a135c0b143ecfba. Mode focused-local / CI-final-enforced, ruleset 26837184 supplied by parent. High-assurance review: untrusted archive input can write files or exhaust resources.

A normalized event preserves its offset timestamp, level, signature, operation, numeric error ID, duration, source and count. Missing metadata remains null, never guessed. Product display prefix has one constant. Numeric IDs do not depend on a product prefix.

The parseInput interface hides bounded archive decoding and folder parsing. ZIP entries are allowlisted and checked against central records, CRC and size before writing into a fresh temporary tree. Stored and deflated files are accepted; encrypted, ZIP64, link and descriptor variants fail closed. Folder chunks and manifest have byte limits; lines and events have separate limits. Malformed complete records fail; incomplete trailing JSON produces a warning. Folder inputs must be stable while read; this CLI does not provide the producer's platform-specific directory-handle pinning against hostile concurrent directory swaps.

emitReport writes an inert escaped copy of data plus a reusable script and JSON sidecar. There is no dashboard, server or network access. The inert copy is deliberate duplication to support file:// without fetch or executable bundle data. The deletion test puts archive/path/normalization complexity back into CLI callers, so the module earns its depth.

Focused Node tests exercise folder/ZIP parity, offset normalization, chunk parsing, truncation, malformed JSONL, path rejection and report escaping. Full repo gates remain CI-final. No packages or native builds required. Actual producer bundle proof and three independent lenses must be supplied before parent publication.

## Bounded collision correction and browser proof

Correction base a5325072. The parent assigned the emitter collision/retry finding and actual file:// proof at the existing seams. Verification remains focused-local / CI-final-enforced as supplied by the parent. Parent owns final independent reviews and publication. No packages, worktrees, producer changes or dashboard work are authorized.

The observable failure was an empty report left behind after a sidecar collision, which blocked retry. Exclusive opens now track each created path. Failed emission rolls back those files only, comparing the current path's device/inode with its open handle before unlinking. Existing outputs are never acquired or deleted. Cleanup failures are reported with the original failure. The identity check avoids deleting an already replaced path; it cannot make check-and-unlink atomic against hostile concurrent directory mutation. Output directories require one writer. The public emitReport interface and CLI caller are unchanged, and no new seam or domain vocabulary is introduced.

The regression exercises collisions at all three output positions, verifies original bytes survive, checks absence of partial outputs and retries the same destination after preserving the collision under another name. A separate real-browser assertion invokes the CLI and loads the emitted HTML via file:// in an isolated offline Chromium profile. It checks the visible model against the JSON sidecar and independent fixture expectations, with no console errors or network requests. An optional hash-pinned native #618 export proves the six producer events and version/OS/build metadata. Browser proof is run once at the committed head through heavy_run using the installed browser and existing Playwright package.

The existing selector expands the whole #330 branch to full scope because package.json changed. That full application suite remains CI-final. The specific local gap is static file:// execution, which the application browser suite does not cover. Only the two viewer browser cases run locally.

The accepted redaction seam remains mandatory. Emission projects metadata and categorizes free-text signatures rather than sharing raw message or operation strings. HTML is a minimal pipeline carrier, not the React dashboard owned by #331.

## PR #620 hosted findings

At 5f39a548, Greptile reported that normalization ignored the producer's `attributes.duration` field and the viewer tests did not run in CI. Normalization now accepts `attributes.duration` after the existing `durationMs` field, and the regression uses the producer event shape. Focused proof: `node --test tests/telemetry-viewer.test.mjs`.

CI wiring proposal only; `.github/workflows/ci.yml` and required checks are unchanged pending owner approval. Add the Node viewer test command to the existing `lint` job. Add the browser test to the existing Chromium-enabled `test-e2e` job, with the viewer path included in the E2E selector so the job runs when those files change. Preserve all existing `CI acceptance` dependencies and protection requirements.
