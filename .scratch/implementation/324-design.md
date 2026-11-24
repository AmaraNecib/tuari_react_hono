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

## Implementation run

- Mode: remote. Ticket source: GitHub issue #324, read on this run.
- Branch: `fix/issue-324`.
- Target ref: freshly fetched `origin/develop`, per owner instruction to start from develop. The local `develop` branch belongs to another worktree and was not changed.
- Pinned base: `853e19342a04687233133b4b9f1148aaea1269c9`. Fast-forwarded `fix/issue-324` to this commit before implementation; retained the design edits.
- Review tier: Standard. This change records lifecycle outcomes, not license payloads or authorization decisions. All three initial local review lenses remain required under the standing review policy.
- No dependency additions planned.

### Interface and ownership

Keep `StructuredLogger` as the API caller interface. Introduce an event-sink interface with `emit(event)`, `flush()`, and a readable degraded flag. Events contain a schema version, offset-aware timestamp, severity, source, message, optional attributes, and optional error signature/count. Capture the timestamp when emitting, not from the request context's creation time.

The desktop already resolves portable and installed log roots. It must pass the resolved root to the API explicitly because the sidecar clears its environment and runs from a runtime directory. Do not derive portable storage from the API working directory.

The shared event-sink protocol has native adapters in TypeScript and Rust. API owns api.log/api.N.log; desktop owns desktop.log/desktop.N.log under the same day folders. This avoids cross-process count-update and rotation races while keeping panic capture independent of API availability. The standalone sink default remains app.log/app.N.log. Both adapters share schemaVersion 1, timestamp, severity, source, message, lifecycle, attributes, and count. No new dependency is required. Cleanup touches only the current writer's chunk prefix. The API and desktop each receive a 100 MiB quota, so concurrent cleanup cannot delete another live writer's records or exceed the shared 200 MiB runtime budget. Standalone app-prefixed logs use a separate root and a 200 MiB quota. Duplicate updates validate a random recordId marker at the saved offset and fall back to a new record if the file was replaced or removed.

### Confirmed test seam

The owner confirmed the event-sink seam in this session before tests were written. Verification mode: focused-local / CI-final-pending. Full acceptance remains a hosted CI gate.

Drive the event-sink interface against a temporary filesystem, with a controllable clock and small configurable limits. Assert the resulting JSONL rather than private helpers. Cover midnight rollover, offset changes, chunk splitting, retention and total-size enforcement, duplicate counts, ring-buffer eviction/flush, partial trailing lines, and nonthrowing write failures.

Capture-adapter integration checks should prove that logger output, uncaught failures, desktop panic, and lifecycle milestones reach that same interface. No product UI changes are planned, so browser UI proof is not applicable to this foundation.

### Storage decisions and review risks

- The first error is durable immediately. A twelve-byte padded JSON numeric count permits in-place updates without rewriting or shifting subsequent records. Signatures include local date and stable failure details, but not request identifiers. Midnight starts a new record even within one minute. The duplicate table is bounded to 1000 signatures and expires per one-minute window. A torn count update remains an inherent removable-media risk.
- Lifecycle milestones bypass the routine debug/info ring. The API ring retains 1000 events and drains before each error. Rust emits lifecycle/error records only.
- Cache the latest chunk per day and inspect only its tail when appending. Repair a non-newline-terminated trailing record with backward 4096-byte reads, without rereading older chunks. Complete earlier records remain intact.
- Startup and durable emits enforce 30 local calendar days and the writer's fixed share of the 200 MiB runtime cap. Capacity for the serialized record is reclaimed before appending. Oversized records are dropped with degraded state and console fallback rather than evicting valid history. Cleanup touches only owned day-folder log names, not arbitrary files.
- The API receives TUARI_LOGS_DIR from the desktop. The legacy unbounded api-server.log writer is removed; raw sidecar stderr is captured in bounded 8192-byte reads through the desktop sink. Log-directory creation failures no longer abort runtime file initialization.
- Caller-level proof imports the actual API entry with controlled composition dependencies and inspects serialized startup/database success/failure events. Rust caller tests exercise real license initialization on temporary files and the actual update command implementation with a fake provider. They capture serialized sink records, not emitted-call counts.
- Ordinary desktop writes wait on the writer mutex rather than dropping contended events. Only panic capture uses try_lock, avoiding deadlock if a panic interrupts a writer. All degraded desktop fallbacks retain error details. A degraded API unhandled-rejection handler prints the original reason/stack before fatal exit. Panic capture uses best-effort stderr fallback. The original panic hook is preserved. A subprocess regression proves panic capture without changing the test runner's global hook.
- The API composition root injects an EventSink logger into the existing shutdown hook. Shutdown timeouts, server-stop failures and database-close failures are durable error/lifecycle records, with original-message stderr fallback if degraded. A focused stdout-source audit found only listening/backup informational output outside this hook; no remaining error-only console.log caller was identified.
- Healthy StructuredLogger sink capture suppresses its redundant console copy. Degraded capture still uses console fallback; raw sidecar stderr remains captured. Readiness errors direct users to day-folder logs, not obsolete api-server.log.
- Never record license keys, database keys, authentication secrets, or entire process environments.

## Out of scope

- #327 ingest server (deferred by schedule).
- Metrics dashboards / Prometheus-style metrics (derive from events later, only for self-hosted server mode).
- Anything that tracks installations or licenses (documented stance).
- Sentry or any third-party crash SDK (decided against: local-first posture, portable data).
