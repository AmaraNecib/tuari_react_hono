# ADR-DIAG-001 — Diagnostics Reports: One-Entry Static HTML with Sidecar Data

**Status:** Accepted
**Date:** 2026-08-10

### Decision

Support bundles are read with a **local CLI tool** (`tuari-viewer <zip-or-folder> -o report.html`) that renders a **one-entry static HTML diagnostics report** — `report.html` + a reusable shell (`report.js`) + this bundle's data as a sidecar (`report-data.json` when the event volume is large). The parse→render core is UI-agnostic so it can later back the ingest-server review surface (#327). Product branding (the error-code prefix) comes from **one constant**, never scattered.

### Rationale

- The product is portable and local-first; the data lives on a USB stick, and no data may leave the host machine. A local tool has zero hosting and zero auth.
- **Local processing is not the same as no privacy surface**: the report is explicitly shareable (attach to an issue, send to a colleague), and sharing moves data off the machine. A **redaction boundary is therefore required before report emission** (see Consequences) — the sanitizer semantics of #326 (user IDs, SQL bindings, tokens, headers never leave) are the floor for what the report may contain.
- At this stage the only reader of bundles is the maintainer — a hosted dashboard or a live app adds machinery nobody needs yet.
- A zip support bundle is the logs folder tree, compressed — parsing a folder tree makes zip support nearly free.
- A static report is **shareable and archival** *after redaction*: attach it to an issue, send it to a colleague, keep it as a record. A live server app cannot travel.
- React via the vite build gives the maintainer's preferred stack without a server at runtime.
- A single product-prefix constant keeps a future product rename to one line; error codes resolve by their numeric ID regardless of prefix.

### Considered Options

- **Live local dashboard app** (watch a folder, live-tail) — rejected for v1: needs a running process, not shareable. May be added later if reproducing bugs live becomes a need.
- **Hosted web app** (upload zip to a site) — rejected: hosting + a privacy surface for data that should stay on the maintainer's machine.
- **Sentry-style hosted crash platform** — rejected in #324: local-first posture; error data leaves the machine only under opt-in (#326).
- **OpenTelemetry collector stack** — rejected in #324: built for server fleets; our "server" is a sidecar inside the exe. The door stays open via OTel-shaped event fields.

### Consequences

- **Redaction boundary (mandatory):** the viewer pipeline runs a sanitization step between the parser and the emitter — same semantics as the #326 sanitizer: drop user IDs, file paths, SQL bindings, tokens, headers, and any non-essential event attributes before writing `report-data.json`/`report.html`. The input bundle is already redacted at #325 (never DB, never secrets), but error-message payloads and log attributes can still embed customer data; the report is shareable only after this step. `report-data.json` must never contain data that #326 promised would never leave the device.
- The viewer depends on the **#324 event schema** and the **#325 bundle shape (incl. `manifest.json`)** — those become stable, versioned contracts; the report-data sidecar must stay parseable (schema-versioned).
- The product prefix must be centralized and treated as data, not prose.
- The dashboard views (#331) are client-side only — no server-side aggregation; trend/cross-bundle analysis is out of scope until the ingest server (#327) exists.

### References

- Tickets: #324 (event log foundation), #325 (support bundle), #326 (opt-in reporting), #327 (ingest server, deferred), #330 (viewer pipeline), #331 (viewer views)
- Design: `.scratch/implementation/330-design.md`
