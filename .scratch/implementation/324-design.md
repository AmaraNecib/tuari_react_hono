# Telemetry & Diagnostics Design (#324)

Anchor issue: #324 (foundation). Companion tickets: #325 (support bundle + Diagnostics UI + error codes), #326 (opt-in anonymous error reporting, client), #327 (ingest server — deferred by schedule, not dependency).

## Why (problem)

Tuari is a portable, local-first ERP. When something breaks at a customer site, we have no signal: no crash reports, no logs we can read, no way for the user to hand us the problem. The product must keep working fully offline and leave no data on the host machine when run from a USB stick, so the classic "send logs to a hosted collector" answer doesn't fit. We need observability that is local-first by construction and only *optionally* phones home.

## Decisions

### D1 — Local-first event log is the foundation (always on, zero network)

Every error and lifecycle event lands in a structured JSONL log on the user's machine. All capture sources funnel through **one event-sink interface** (the single seam for the whole feature):

- API structured logger output (`StructuredLogger`)
- `uncaughtException` / `unhandledRejection` in the API process
- Desktop shell panic hook (Rust)
- Lifecycle milestones: startup, shutdown, license validation, DB migration success/failure, update checks, slow operations (>2s)

### D2 — Storage layout: one folder per local calendar day

- Root: portable installs → `data/logs/` beside the executable (already resolved by `resolve_portable_data_dir`); installed → the app-data logs dir. Everything travels with the stick; nothing stays on the host.
- Folder name = **local calendar date of the event** (`2025-08-11/`), decided **per event**, not per session. A session spanning midnight (started 23:55:45) writes the first event after 00:00:01 into the new day's folder — no timer needed.
- **Line timestamp = offset-aware ISO 8601** (`2025-08-10T23:55:45.123+01:00`). One field carries the instant (sortable/UTC-comparable), the user's local time, and the timezone. Folder = local date (what the user calls "today"); line = exact instant + offset. Timezone changes mid-session lose nothing.
- Chunk split at ~5MB (`app.log` → `app.1.log`); retention = 30 days + hard total-size cap (~200MB); cleanup on startup.
- A truncated trailing line (USB unplug mid-write) is tolerated silently; appends are atomic-ish (JSONL).

### D3 — Logging must never hurt the app or the machine

- Write failures never crash the app: drop event, fall back to console, set "logging degraded" flag.
- Duplicate-error rate limiting: same signature within a minute → one line + `count`.
- Flash-wear awareness: `debug`/`info` stay in an in-memory ring buffer (~last 1000 events), flushed to disk only when an error occurs. USB sticks have limited write endurance.

### D4 — Human-readable retrieval: support bundle + error codes (#325)

- Settings → Diagnostics: redacted recent-events viewer, one-click **support bundle** (zip of logs + app version + OS + config; never DB, never secrets).
- **Error codes** `TUARI-XXXXXXXX` shown in the UI on failure and written to the log — a user quoting the code lets support locate the exact event. This is the "user hands me the problem" mechanism.

### D5 — Optional phone-home, strictly opt-in (#326)

- Settings toggle, **default OFF**: "Help improve Tuari by sending anonymous error reports".
- Sanitizer is the hard boundary: user IDs, SQL bindings, tokens, headers never leave the device. Only error signature, stack hash, app version, OS, operation name, timestamps.
- Flusher: batch, retry with backoff, kill-switch on server rejection, never blocks the app, spools to disk while offline.
- Endpoint URL is configuration — a local/dev endpoint stands in until #327 ships.
- Constraint (from `docs/licensing-architecture.md`): **no telemetry for licensing** — no installation/edition/crack tracking ever. This feature is error reporting only.

### D6 — No OpenTelemetry / no heavy stack now

OTel (agent → collector → backend) is built for server fleets; our "server" is a sidecar inside the user's exe. Not adopted now. **Door kept open**: event schema follows OTel log conventions (timestamp, severity, trace id, attributes) so a future migration is cheap. #327 (ingest server) is a small Hono `POST /events` + SQLite, not a collector.

### D7 — Seam (testing strategy)

**One seam: the event-sink interface.** All capture sources emit through it; tests drive it with a temp dir and assert: day-folder routing incl. the 23:55→00:00 rollover, offset timestamps, local-date naming, 5MB chunk split, retention cleanup, truncated-line tolerance, rate limiting, ring-buffer flush. The flusher is tested through the same seam with a fake transport. Rust panic hook is a thin append to the same sink.

## Prior art / status check (what already exists)

- `StructuredLogger` (JSONL-ish, console-only) — exists; needs a file sink, not a rewrite.
- `resolve_portable_data_dir` / `resolve_logs_dir` — portable + installed roots already resolved.
- **Never ticketed before**; docs planned it but never shipped: `docs/PHASE5-INTEGRATION-RELEASE.md` ("[ ] Desktop app crash reports"), `docs/RELEASE_SUMMARY.md` ("[ ] Desktop crash reports reviewed"), `docs/prd/licensing-prd.md` (telemetry as v2 item).
- #237 (Audit page system log) is the in-app audit-trail UI — unrelated to this effort.

## Out of scope

- #327 ingest server (deferred by schedule).
- Metrics dashboards / Prometheus-style metrics (derive from events later, only for self-hosted server mode).
- Anything that tracks installations or licenses (documented stance).
- Sentry or any third-party crash SDK (decided against: local-first posture, portable data).
