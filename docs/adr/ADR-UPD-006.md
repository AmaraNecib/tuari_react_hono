# ADR-UPD-006 — Smoke Test Definition: Binary Start, Health Check, Database Open

**Status:** Accepted  
**Date:** 2026-07-08

### Decision

The smoke test suite after an update shall consist of exactly **three checks**:

1. **Binary starts** — The main `Tuari.exe` launches and the process remains alive for at least 5 seconds without crashing.
2. **API responds to health check** — The local API sidecar is reachable at `http://127.0.0.1:4318/health` and returns HTTP 200 with a valid JSON response body containing `{"status": "ok"}`.
3. **Database opens** — The SQLite database file at the resolved data path opens successfully, and `SELECT name FROM sqlite_master WHERE type='table'` returns successfully (no corruption, no permission error).

All three must pass for the update to be considered successful. If any check fails, the update is rolled back.

### Rationale

- Fast: all three checks complete within seconds. The test harness does not need to wait for the WebView or UI initialization.
- Catches common failure modes:
  - Binary fails to start: corrupted executable, missing runtime dependencies, sidecar loading failure
  - API health check fails: sidecar crash, port conflict, migration failure preventing API startup
  - Database open fails: corrupted SQLite file, incompatible schema version from failed migration, permission issues
- Does not require a WebView or graphical environment, making it suitable for headless CI and recovery-mode execution.
- Each check is a necessary condition for the application to function. If the binary starts but the API does not respond, or the database does not open, the application is in a degraded state that should be caught before the user encounters it.
- The alternative — full UI smoke tests — would require a graphical environment and increase test time from seconds to minutes, with negligible additional coverage for update-validation purposes.

### Consequences

- The smoke test must be implemented as a reusable module (in Rust) that the Updater Engine calls after applying an update and starting the sidecar.
- The smoke test must have a configurable timeout (default: 30 seconds) for all checks to complete.
- The API health endpoint (`/health`) must be implemented and must not require authentication.
- A test SQLite database must be included in the test harness to validate the database-open check. This database should have known content and a known schema version for verification.
- The smoke test module must log detailed failure information (which check failed, with what error) to aid debugging in the field.
- The smoke test should be extensible: future checks can be added by implementing a `SmokeCheck` trait without modifying the orchestration loop.
- If the API is not running (recovery mode), the smoke test still performs checks 1 and 3.

### References

- **Architecture:** `docs/update-architecture.md` §5 (Updater Engine Responsibilities — smoke tests), §26.3 (Testing Strategy)
- **ADR-RCA-001:** Rust Core Architecture
