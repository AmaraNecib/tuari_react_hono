# Backups

Tuari takes a local backup of its database once a day, on startup. This is the
cheap safety net for the failure that cannot be recovered from: a mistake or an
app bug that loses a week of entered data.

## What is backed up

**The database only**, as a full copy. In this version attachments (invoice
files) are **not** backed up — see [Limitations](#limitations).

## Where

```
<backups root>/<YYYY-MM-DD>/tuari.sqlite
```

The folder is named for the period the backup covers (the day that just ended),
so the backup taken on the morning of 2026-01-15 covers 2026-01-14.

The backups root defaults to a sibling of the database's directory — **not**
inside it — so deleting the project data directory does not delete the backups:

| Deployment | Database | Backups root |
| --- | --- | --- |
| Desktop (Windows) | `<Tuari>/projects/default/tuari.sqlite` | `<Tuari>/projects/backups/` |
| Dev (`pnpm dev:api`) | `<repo>/data/tuari.sqlite` | `<repo>/backups/` |

Set `APP_BACKUPS_ROOT` to an absolute path to move the backups root (for
example to a second drive). The value is read from the environment, the same
surface as `APP_DB_PATH` and `APP_ATTACHMENTS_ROOT`.

## When

On every API startup the backup service looks at the newest dated folder:

- no backup yet, or the newest is older than yesterday → take a backup for the
  period that just ended;
- the newest is yesterday or newer → do nothing.

So a normal day produces at most one backup, and the app can be restarted
freely without taking extra copies.

## How

The database is copied with `VACUUM INTO`, not with a file copy. `VACUUM INTO`
is a single statement that produces a consistent snapshot of a live database
(even while the app is writing); copying the `.sqlite` file directly while WAL
is active can produce a corrupt backup, which is worse than no backup. The copy
is written to a staging folder first and renamed into place, so a crashed or
failed run never leaves a half-written dated folder behind.

If the database is encrypted (SQLCipher), the backup is encrypted with the same
key.

## How to restore

Restore is "copy the file back". The database is a single file, so there is
nothing to reassemble.

1. **Close the app.** The API sidecar holds the database open; replacing it
   while the app runs can corrupt it.
2. Find the backup you want: `<backups root>/<YYYY-MM-DD>/tuari.sqlite`.
3. Replace the live database with the backup:
   - copy `<backups root>/<date>/tuari.sqlite` over
     `<project>/tuari.sqlite` (desktop) or `<repo>/data/tuari.sqlite` (dev);
   - delete any leftover `tuari.sqlite-wal` and `tuari.sqlite-shm` files next
     to it. A stale write-ahead log belongs to the old database and must not be
     replayed against the restored one.
4. Start the app.

If the database is encrypted, the backup carries the same encryption key. A
restore onto a **fresh install with a different key** will not open; keep the
key that was in use when the backup was taken.

## Retention

Keep a bounded history, oldest-first, never touching the newest backup:

- **14 daily** backups (the newest 14 folders);
- then one per **week** for the newest **8** ISO weeks;
- then one per **month** for the newest **6** calendar months.

That is roughly a six-month horizon in about 28 folders. The policy lives in one
constant (`BACKUP_RETENTION` in `apps/api/src/modules/backup/backup.policy.ts`),
so it is not scattered across the code. Pruning happens after a successful
backup.

## When a backup fails

A backup failure never blocks startup. The app stays usable, the reason is
logged, and the status is available to the UI through the authenticated
`backupStatus` read:

```
{
  lastSuccessAt: string | null,   // when the last backup succeeded
  lastBackupPath: string | null,  // the newest backup folder on disk
  lastFailure: { at, reason } | null
}
```

The most common failure is a full or read-only backups root. The previous
backups are left untouched.

## Limitations

- **Attachments are not backed up in this version.** A restored database may
  reference invoice files that no longer exist (or that were never in the
  backup). This is a deliberate MVP cut: the data the operator actually entered
  lives in the database, which is what this feature protects. Attachment backup
  is tracked separately.
- **Same disk means the backups do not protect against hardware failure or
  theft.** A dead disk or a stolen laptop takes the live database and its
  backups together. This feature protects against mistakes and app bugs, which
  is exactly what it claims to do. For off-site protection, point
  `APP_BACKUPS_ROOT` at a synced or external location, or copy the backups root
  off the machine.
- A backup is only as good as it has been tested. Restore one into a scratch
  copy occasionally.
