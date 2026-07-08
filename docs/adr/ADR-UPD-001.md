# ADR-UPD-001 — Windows Update Strategy: Stub Updater for Locked File Handling

**Status:** Accepted  
**Date:** 2026-07-08

### Decision

Use a dedicated **stub updater** (`stub_updater.exe`) to handle locked-file replacement on Windows. The main application writes update files to a staging directory, signals the stub updater, and exits. The stub updater replaces the locked files after the main process terminates, then restarts the application.

### Rationale

- Windows locks the running executable (`Tuari.exe`) while the process is active, preventing in-place replacement.
- A stub updater is the established pattern used by Chromium, Firefox, Docker Desktop, and other Windows-native update systems.
- The alternative — using Windows MoveFileEx with `MOVEFILE_DELAY_UNTIL_REBOOT` — would require a system reboot, which is unacceptable for a desktop application.
- Another alternative — running the update in a separate Windows service — introduces installation complexity and service management overhead.
- A stub updater is lightweight (~10 KB binary), has no dependencies beyond kernel32, and communicates with the main process via a simple command-line argument (path to the staged update).
- Cross-process communication is limited to a single argument (staging directory path), minimizing the IPC surface area.

### Consequences

- An extra binary (`stub_updater.exe`) must be shipped with every release and signed.
- The stub updater must be written in a language with minimal runtime dependencies (Rust or C).
- The main application must implement a handoff protocol: write staging path, launch stub updater, wait briefly, then exit.
- The stub updater must include a fallback: if the main process does not exit within a timeout, prompt the user to close it manually.
- On non-Windows platforms (macOS, Linux), file replacement is handled via atomic `rename()` syscalls, so the stub updater is Windows-only.
- The stub updater must verify the staged update signature before applying it, preventing tampering between staging and replacement.
- Portable mode must use the same stub updater for locked `Tuari.exe` replacement.

### References

- **Architecture:** `docs/update-architecture.md` §26.1 (module allocation: `stub_updater.rs`), §26.4 (ADRs to Create)
- **ADR-RCA-001:** Rust Core Architecture
