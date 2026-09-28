# #430 — Daily local backups (previous day)

- mode: remote
- ticket: #430 `[post-MVP] Daily local backups: on app start, back up the previous day into a dated folder`
- worktree: `worktrees/feat-daily-backups`, branch `feat/430-daily-backups`
- base ref: `origin/develop` @ `1dc619110a4806b28c54d8f01aef419ce54ff8ed`
- base SHA (merge-base develop..HEAD): `1dc6191`
- review tier: Standard (new module + config + contract + docs; no authz/crypto/finance)
- parent decision: **scope cut to the database only** — attachments, the
  content-addressed store, and hard links were explicitly dropped before the
  final implementation. Attachment backup is tracked separately.

## Why the API, not the shell

The API owns the single better-sqlite3 connection. A backup has to be a
consistent snapshot, so the database is copied with `VACUUM INTO '<path>'` — one
statement, consistent while other writers are active, and identical under
SQLCipher (the output is encrypted with the same key). A plain file copy while
WAL is active can produce a corrupt backup. The Rust shell still only starts the
sidecar; no Rust change is needed because the backups root is derived from
`APP_DB_PATH` and overridable with `APP_BACKUPS_ROOT`.

## Where backups live

`backupsRootPath` resolves from `APP_BACKUPS_ROOT` when set, otherwise
`resolve(dirname(APP_DB_PATH), "..", "backups")`.

- dev default DB `cwd/data/tuari.sqlite` → `cwd/backups`
- desktop DB `<tuari>/projects/default/tuari.sqlite` → `<tuari>/projects/backups`

It is a **sibling of the project/data directory, never inside it**, so deleting
`projects/default` (the reset path) cannot delete the backups. A full `<tuari>`
wipe still removes them — same-disk backups do not survive that, which is stated
in `docs/backups.md`.

## Layout of one backup

```
<backupsRoot>/<YYYY-MM-DD>/tuari.sqlite   # full VACUUM INTO copy (encrypted when the live DB is)
```

The daily folder is written to a `.staging-*` sibling first, then renamed into
place, so a crashed/failed run never leaves a dated folder that looks complete.
Stale `.staging-*` entries from a crashed run are removed at the start of the
next run.

## Scope cut

Attachments are **not** backed up in this version (deliberate MVP cut). A
restored database may reference attachment files that are gone. `docs/backups.md`
states this plainly. This keeps every restore self-contained ("copy the file
back") and the feature small. An earlier iteration implemented incremental
attachment copies and then a content-addressed store with hard links; both were
removed on the parent's instruction, not left half-wired.

## Trigger and clock

`isBackupDue(newestDate, now)` is `newestDate === null || newestDate <
formatBackupDate(previousDay(now))`. On a due run the target folder is
`previousDay(now)` ("the period that just ended", the closed-yesterday /
opened-today flow). The calendar-day comparison means at most one backup per
day; the clock is injected (`now`) so no test waits a day.

`index.ts` does **not** run the backup on the startup path. It scans for
`/health` and hands control to `backup.scheduler.ts`, which defers the run to a
later event-loop turn and gates it on the first ready probe (with a 30s fallback
for an install nobody polls). `runDueBackup` is synchronous and never throws, so
once it starts it cannot race an open transaction; the gate is what keeps it
from delaying the `/health` response the Rust shell waits ~15s for. A large
snapshot still blocks the event loop while it runs, but only *after* readiness
has been proven.

## Failure handling and status

`runDueBackup()` never throws: on failure it removes the staging dir, records
`lastFailure { at, reason }`, logs the reason (injectable `{ info, error }`
logger, defaulting to `console.log` / `console.error`), and returns a `failed`
result. The app keeps running.

Status is exposed by the `backupStatus` read RPC behind the same `m.queryAuth`
admin gate every other read uses:

```
{ lastSuccessAt: string | null, lastBackupPath: string | null,
  lastFailure: { at: string, reason: string } | null }
```

`lastBackupPath`/`lastSuccessAt` are seeded from the newest on-disk backup at
construction, so they survive a restart. `lastFailure` is per-process: the run
happens on every start, so a still-failing host repopulates it immediately; the
durable evidence of staleness is the newest backup folder's date (also in the
payload). This is stated in the design comment and docs.

## Retention policy

`BACKUP_RETENTION = { daily: 14, weekly: 8, monthly: 6 }` — one constant with a
comment, not scattered numbers. `selectBackupsToPrune(dates, policy)`:

1. keep the newest (explicit guard, never pruned);
2. keep the newest `daily` folders;
3. from what remains, keep the newest folder of each of the newest `weekly` ISO
   weeks;
4. from what remains, keep the newest folder of each of the newest `monthly`
   calendar months;
5. prune the rest, oldest-first, after a successful backup.

The service accepts a `policy` injection seam for tests; production uses the
constant.

## Files

- `packages/contracts/src/backup.ts`, `backup-contract.ts`; exported from
  `index.ts`, spread into `app-contract.ts`.
- `apps/api/src/infrastructure/config/database-env.ts` — `resolveBackupsRootPath`
- `apps/api/src/config/index.ts` — `backupsRootPath` on `AppConfig`
- `apps/api/src/modules/backup/{backup.types,backup.policy,backup.service}.ts`
- `apps/api/src/rpc/handlers/backup.ts`, wired in `rpc/router.ts`
- `apps/api/src/app/dependencies.ts` — construct + expose `backupService`
- `apps/api/src/index.ts` — detect `/health`, start the scheduler on listening
- `apps/api/src/modules/backup/backup.scheduler.ts` — readiness-gated timing
- `apps/api/vitest.config.ts` — add `src/modules/backup/**` to the coverage
  include (repo convention for new modules)
- `docs/backups.md`

## Tests (all injected clock, no waiting)

`backup.policy.test.ts`: date helpers, due/not-due boundaries (first-ever run,
same-day re-start, multi-day gap, future), retention selection exactness and
never-newest, ISO-week/month bucketing, default-policy count (14+8+6).

`backup.service.test.ts` (real temp dirs + real better-sqlite3, plain SQLite
only — the encrypted path is recorded as a skipped test):
1. due backup is taken — dated folder has a readable `tuari.sqlite`;
2. a not-due start takes none;
3. a snapshot taken while another connection holds a write is readable — open
   it, `PRAGMA integrity_check` = ok, committed row present, uncommitted absent;
4. retention prunes exactly the policy set and never the newest;
5. a failed backup (throwing `exec` with a previous backup present; and an
   unwritable root) leaves previous backups intact and reports the reason;
6. a non-Error throw is reported as a string;
7. a correctly named folder with no snapshot (or a zero-byte one) is not
   counted, so it neither suppresses the run nor holds a retention slot;
8. an unlistable backups root degrades to a recorded failure at construction
   instead of aborting the boot, and a preflight cleanup throw is recorded
   inside the guarded region (status never reads healthy after a failure);
9. stale staging dirs are removed; status is seeded from disk; empty status when
   there are no backups; default clock/logger seams work.

`backup.scheduler.test.ts`: the run never fires synchronously with the default
scheduler, is idempotent across health+fallback, defaults the fallback delay and
unrefs the timer, logs a rejection without throwing, and an integration test
asserts `/health` is answered while a blocking fake snapshot is still only
scheduled.

No Playwright spec: this change ships no UI. The status RPC is the surface for
a later UI; the contract + router wiring pin it.

## Risks / migration

- New env var `APP_BACKUPS_ROOT` (optional). No schema/migration change.
- SQLCipher is not built in this worktree, so encrypted-copy behavior is not
  exercised; `VACUUM INTO` is the documented cross-mode primitive and produces
  an encrypted output when the source is encrypted.
- Coverage include growth: `src/modules/backup/**` stays at 100%.
