# ADR-UPD-005 — Backup Retention Policy: Keep 3 Most Recent Backups

**Status:** Accepted  
**Date:** 2026-07-08

### Decision

Retain the **3 most recent backups** of the application installation and database. Older backups are deleted when new ones are created. A backup is eligible for deletion only when the 4th most recent backup exists.

### Rationale

- Three backups provide a safety net across multiple update attempts:
  - **Most recent (N):** immediate rollback target after a failed update
  - **Previous (N-1):** available if the user attempts another update before the smoke test passes
  - **Oldest (N-2):** recovery option if a problem is detected days later (e.g., data corruption that only becomes apparent after several restarts)
- Disk usage is bounded: at ~500 MB per full backup, 3 backups use ~1.5 GB worst case, which is negligible on modern systems.
- The backup logic is already implemented in M2.4 (Updater Engine backup/restore). This ADR formalizes the retention policy that the logic should enforce.
- The alternative — keeping backups indefinitely — would cause unbounded disk growth on systems with frequent updates.
- The alternative — keeping only 1 backup — would leave no safety net if the user applies a second update before verifying the first.
- The alternative — time-based retention (keep backups for 7 days) — is harder to reason about than count-based and could result in zero backups if no updates occur within the window.

### Consequences

- N/A — backup logic is already implemented in M2.4. The retention policy only needs to be enforced in the cleanup step after a successful update.
- On each successful update (smoke test passed), the cleanup step must:
  1. Count existing backups
  2. Delete the oldest backup(s) until at most 3 remain
  3. Retain the most recent backup even if it was created by this update
- Backups older than 3 generations are deleted immediately, not deferred to a cleanup job.
- The retention count (3) is a configuration constant that can be adjusted in the future without changing the policy.
- Manual backups (user-initiated) are not subject to automatic deletion.

### References

- **Architecture:** `docs/update-architecture.md` §19 (Rollback Strategy), §19.2 (backup retention safety window)
- **ADR-RCA-001:** Rust Core Architecture
