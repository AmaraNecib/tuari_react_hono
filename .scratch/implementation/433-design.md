# Issue #433: immutable attachment objects in backups

- Base: `853e19342a04687233133b4b9f1148aaea1269c9` (`origin/develop` matched).
- Worktree: `D:/worktrees/tuari_react_hono/t3-0ec820b2-dd2f9cc5add2bc25`.
- Mode: `focused-local / CI-final-pending`, resolved from `docs/engineering-workflow.md` and `docs/ci-final-activation.md`. Tier: Standard; three initial independent review lenses remain parent-owned.
- Reachable risk: an attachment referenced by a consistent database copy can be missing or mutated before its backup is completed.
- Decision: immutable objects are content-addressed by SHA-256 and written before the database row is attached. Keep legacy relative paths as aliases for compatibility. Snapshot the database first, query attachment references from that completed copy using the configured SQLite driver/key, and include only verified referenced paths. Missing or mismatched legacy bytes fail the backup non-fatally. Hard-link objects into snapshots, copy when linking fails and report fallback counts/reasons. Deletion and pruning never remove store objects; retain them without garbage collection.
- No schema migration or global snapshot lock. Existing `InventoryAttachmentStorage` and `BackupService.runDueBackup` are the seams. Snapshot paths preserve database-relative paths for restore.
- Vocabulary: attachment row is the database reference; immutable object is the SHA-256-addressed bytes; legacy alias is the existing mutable relative path. The storage interface remains the upload/download seam; backup service owns database snapshot composition.
- Architecture: storage and snapshot interfaces change; no broader architecture sweep in this lane.
- Applied lessons: `read-only-better-sqlite3-hides-wal-mode-data` (read completed copy with same driver/key, not live read-only handle); `deterministic-concurrency-tests-for-single-connection-ports` (test deletion race against immutable objects); `migrations-inside-the-composition-root-kill-the-schema-less-db-trick` (older schema must be handled without migration).
