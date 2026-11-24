# PR 618 hosted corrections

Base: `3a8ca1157816716728a9a770c9d48a8236d1395b`.
Worktree: `D:/worktrees/tuari_react_hono/t3-c816ba23-058ba9b5eb45b5a5`.
Branch: `fix/618-hosted-five-c816ba23`.
Mode: focused-local / CI-final-enforced, supplied by parent with activation reference 26837184. The old base's pending policy text is historical; the parent owns current protection verification and combined review.
Tier: high-assurance correction. Windows retention and trusted filesystem traversal can discard new errors or expose files outside the log directory. This lane never publishes, requests hosted review, changes dependencies or CI, or merges.

## Findings and decisions

1. Recent errors disappear. Valid. The recent viewer previously read file prefixes under an 8 MiB aggregate budget, and successful retained reads replaced the current-process ring. Read bounded tails with a share for every chunk in each newest day. Discard the leading partial record. Merge process metadata with retained metadata by multiplicity before the final timestamp sort and 100-event cap. Identical projections can represent distinct events, so set deduplication is not safe. Tests cover an oversized single chunk, two large chunks plus a memory-only event, and the existing 105-event bound.
2. Export can drop new logs. Valid. Windows chunk readers now share read/write/delete. Root and day handles still deny delete sharing, retain OPEN_REPARSE_POINT and BACKUP_SEMANTICS, and validate reparse attributes before and after opening. A Windows test holds the reader, deletes its chunk, reads the original bytes and emits a new event. It also proves the held directory cannot be renamed. Existing junction rejection remains required.
3. Browser diagnostics always fail. Valid. SettingsSection mounts DiagnosticsSettings only in desktop runtime. Browsers receive the existing translated desktop-only message. Tests exercise both runtime branches and assert the native panel is never mounted in a browser. DiagnosticsSettings, its tests and locales belong to another lane and are untouched.
4. Reads block all desktop logging. Valid. Copy root and recent metadata under the writer mutex, drop the guard, then scan and sort. The same helper used by recent_diagnostics accepts a scan callback for deterministic proof that a writer can acquire the mutex and emit during scanning. No sleeps or shared global initialization are needed.
5. ZIP success lacks automated checks. Valid. The normal Rust test always invokes Python 3's standard-library zipfile reader. It validates exact names, independently expected payload bytes and every CRC through testzip. No environment-variable opt-in and no package dependency. Missing Python is an explicit test failure, not a skip. Existing rejected-input and capacity tests remain.

## Interfaces and scope

The public diagnostic event and ZIP formats do not change. DiagnosticEvent is a sanitized projection, not raw log data. A chunk reader may retain a handle to a deleted chunk; a directory handle must pin trusted traversal. The snapshot copy contains only root and 100 metadata records, not writer duplicate state or chunk indexes. The private scan callback keeps lock ownership in one module. Deleting these helpers would restore file parsing and mutex ownership in the public adapter, so keeping them local avoids a new abstraction layer. Architecture review remains parent-owned.

## Verification boundary

D: initially had 377 MiB free. No Cargo target or package installation is created. An ignored standalone Rust test harness compiles the three changed native modules against read-only existing dependency rlibs. This proves their Windows behavior without rebuilding Tauri or writing a shared target. Full crate Clippy, browser rendering and CI acceptance are distinct from this focused proof. Exact commands, failures, durations and tested SHA live in ignored `.scratch/reviews/618-hosted/`.

Applied wisdom: preserved failed logs; used deterministic lock scheduling rather than delays. Dependency-cache version checking applies before web proof. No wisdom files changed. Candidate lesson: trusted directory handles and retention-compatible chunk handles need different Windows sharing flags.
