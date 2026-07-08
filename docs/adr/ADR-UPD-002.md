# ADR-UPD-002 — Recovery Console: `--recover` Command-Line Flag

**Status:** Accepted  
**Date:** 2026-07-08

### Decision

Use a `--recover` command-line flag on the main `Tuari.exe` binary to enter recovery mode. No separate recovery binary is introduced.

### Rationale

- A command-line flag on the main binary is the simplest possible mechanism: a single `if` check in `main.rs` that dispatches to recovery logic instead of normal startup.
- No separate binary means no extra signing, distribution, or update coordination overhead.
- The recovery mode does not require the WebView, API sidecar, or any UI — it operates purely via CLI with console output and filesystem operations.
- Recovery capabilities are limited: rollback, database restore, and system information display. These do not justify a separate executable.
- The `--recover` flag is easy to invoke from:
  - The stub updater (after a failed update)
  - A desktop shortcut (hold Shift + click "Troubleshoot")
  - A recovery console entry in the Windows Start Menu
  - Manual invocation from a terminal or Run dialog
- The alternative — a dedicated recovery binary — would increase the distribution package size and require the same cryptographic verification as the main binary, duplicating trust logic.

### Consequences

- `main.rs` must detect the `--recover` flag before any other initialization (sidecar startup, WebView creation, license check).
- Recovery mode must not require a valid license, since a failed update could coincide with licensing issues. The license check is bypassed in recovery mode.
- Recovery mode must have read-write access to the backup directory and database location.
- The recovery binary stub references in the Windows registry or Start Menu must pass `--recover` as an argument.
- Recovery mode must display output to the console or a simple CLI prompt, not to the GUI.
- `--recover` is a reserved argument that must not conflict with any future command-line parsing.

### References

- **Architecture:** `docs/update-architecture.md` §20 (Recovery Environment), §26.2 (Phase 2: `recovery.rs`)
- **ADR-RCA-001:** Rust Core Architecture
