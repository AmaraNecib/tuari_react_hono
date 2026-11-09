## Read-only better-sqlite3 hides WAL-mode data (🟡 Minor)

Opening a live better-sqlite3 DB file `readonly: true` while the writer holds
it can report 0 rows because the data lives in the un-checkpointed `-wal`.
On #254 a passing bootstrap test left a "0 users" DB that the API served
with `hasUsers: true`. The row was in the WAL. Checkpoint (or read with the
writer stopped) before trusting a read.

**Always**: when inspecting a live sqlite DB for evidence, close the writer
first or `PRAGMA wal_checkpoint` before the read.

