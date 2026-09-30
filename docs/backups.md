# Backups

Tuari takes a local backup of its database once a day, on startup. This is the
cheap safety net for the failure that cannot be recovered from: a mistake or an
app bug that loses a week of entered data.

## What is backed up

**The database only**, as a full copy. In this version attachments (invoice
files) are **not** backed up (see [Limitations](#limitations)).

## Where

```
<backups root>/<YYYY-MM-DD>/tuari.sqlite
```

The folder is named for the period the backup covers (the day that just ended),
so the backup taken on the morning of 2026-01-15 covers 2026-01-14.

The backups root defaults to a sibling of the database's directory, **not**
inside it, so deleting the project data directory does not delete the backups:

| Deployment | Database | Backups root |
| --- | --- | --- |
| Desktop (Windows) | `<Tuari>/projects/default/tuari.sqlite` | `<Tuari>/projects/backups/` |
| Dev (`pnpm dev:api`) | `<repo>/data/tuari.sqlite` | `<repo>/backups/` |

The root defaults to the sibling shown above. An absolute `APP_BACKUPS_ROOT`
moves it (for example to a second drive). This is an **API-side environment
variable**: it is useful for development and for a manual (sidecar) install.
The desktop shell clears the sidecar environment and forwards only a fixed
allowlist that does **not** include `APP_BACKUPS_ROOT`, and its user-editable
`config.json` has no backups setting, so **on the desktop the root is always
the default sibling** and this variable has no effect. Exposing it as a desktop
setting is tracked as a follow-up.

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
runs on a dedicated connection in a worker thread, so it never blocks the API's
event loop, and it is written to a staging folder first and renamed into place,
so a crashed or failed run never leaves a half-written dated folder behind.

Every snapshot folder also holds a small `snapshot.json` marker naming the app
and the snapshot format. The marker is what identifies a folder as **ours**:
listing, pruning and deletion only ever touch marked folders, so pointing
`APP_BACKUPS_ROOT` at a shared directory can never have an unrelated same-named
folder treated as a backup or removed. Before a folder is accepted as a
snapshot, its copy must pass `PRAGMA integrity_check`, and a plaintext copy must
start with the SQLite file magic; a non-empty file is not automatically a
usable database.

If the database is encrypted (SQLCipher), the backup is encrypted with the same
key: the key in force at the moment the copy is taken.

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

If the database is encrypted, the backup carries the encryption key that was
**in force when the snapshot was taken**. A restore onto a **fresh install with
a different key** will not open. In particular, a snapshot taken **before a key
rotation** can only be opened with the **pre-rotation key**: the snapshot's
usability depends on the key at the time it was written, not the current one.
Keep the key that was in use when the backup was taken.

Encryption and key rotation are **parked** in this version: the encrypted
SQLCipher build is not proven yet (#410) and encryption at rest is not available
(#435). Rotation itself exists elsewhere in the app (the database-key change
flow), but it only re-encrypts the live database. It does **not** re-encrypt
existing backups. A snapshot stays encrypted with the key that was in force when
it was taken, so a snapshot taken **before** a rotation opens only with the
pre-rotation key. Keep that key for as long as you may need to restore that
snapshot, and note the rotation point when restoring an older one. Handling
rotated keys for backups is deliberately out of scope here, alongside the
attachment coverage follow-up (#433).

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
  is exactly what it claims to do. For a manual/API install, point
  `APP_BACKUPS_ROOT` at a synced or external location (the desktop does not
  expose that variable yet); on the desktop, copy the backups root off the
  machine instead.
- A backup is only as good as it has been tested. Restore one into a scratch
  copy occasionally.
