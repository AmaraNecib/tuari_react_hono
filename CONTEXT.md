# Context — Diagnostics & Telemetry

Domain terms for the diagnostics/telemetry area. This is a glossary, not a spec.

## Terms

- **Telemetry event** — a single structured record of something that happened in the app (error, lifecycle milestone, slow operation). Written as one JSONL line with an offset-aware ISO timestamp.
- **Event sink** — the single interface every capture source (API logger, uncaught handlers, panic hook, lifecycle) writes through; the one seam where telemetry is produced and tested.
- **Support bundle** — the zip a user sends (or the maintainer picks up from a portable install): the day-folder logs plus a `manifest.json` (product, version, OS, build, timestamps). Never contains the database or secrets.
- **Diagnostics report** — the shareable HTML artifact a viewer produces from a support bundle or logs folder; the maintainer's readable view of a deployment's events.
- **Diagnostics viewer** — the local CLI tool that turns a support bundle or logs folder into a diagnostics report.
- **Error code** — the user-visible identifier for a failure, format `PREFIX-XXXXXXXX`. The numeric ID is the stable identifier; the prefix is a single constant so a product rename is a one-line change.
- **Error signature** — the deduplication key for an error (normalized stack/message), used for rate limiting and for grouping errors in the diagnostics report.
