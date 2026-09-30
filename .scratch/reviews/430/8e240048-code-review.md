# #430 code review (lane self-review, PR #434 review round 2)

- reviewed code HEAD: `8e240048` (`fix(backup): marker-identified snapshots, off-thread copy`)
- base: `develop` @ `1dc6191`
- tier: Standard
- PR: #434 (parent-owned; a lane never merges)
- scope: `apps/api/src/modules/backup/**`, `apps/api/src/app/dependencies.ts`,
  `apps/api/src/index.ts`, `apps/api/tsup.config.ts`, `docs/backups.md`, the
  design doc.

## Round-2 findings and resolution

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Correctness | `APP_BACKUPS_ROOT` on a shared directory: a folder named for yesterday's date could be treated as ours and deleted. | Every snapshot folder now carries a `snapshot.json` marker (app + format + schema version). Listing, pruning and deletion all require it. An occupied target that is not a marked snapshot is left untouched and the run records the refusal. Tests: foreign same-named folder intact + run fails; `pruneBackups` never deletes a markerless folder. |
| 2 | Correctness | The synchronous `VACUUM INTO` ran on the event loop and stalled the API. | `VACUUM INTO` now runs on a dedicated connection in a worker thread (`backup.snapshot.ts`). Test: a 200k-row copy while a 1ms timer fires > 0 times, plus a real integrity-checked copy. |
| 3 | Correctness | A future-dated snapshot suppressed backups for years. | `isBackupDue` treats a date later than today as no usable snapshot; `listBackupDates(root, now)` excludes future dates so they cannot hold the newest retention slot. Tests: policy future-date + service takes a fresh backup with a `2099-01-01` folder present. |
| 4 | Correctness | The snapshot bypassed the connection lock. | Answered by the dedicated connection in the worker (the sanctioned alternative): the copy never shares the connection the repositories serialize on. Test: copy taken while another connection holds `BEGIN IMMEDIATE`. |
| 5 | Correctness | A positive size implied a valid snapshot. | The worker runs `PRAGMA integrity_check` on the copy; a plaintext folder must start with the SQLite file magic before it is listed. Tests: non-SQLite, truncated, empty, unopenable copies are not snapshots; an encrypted marker is accepted without the magic. |
| 6 | Correctness | Cleanup could mask the backup failure; a refused prune was log-only. | Staging cleanup is wrapped in its own try/catch and the original reason survives on `lastFailure` and the result; a refused prune is surfaced on `lastFailure`. Tests: cleanup failure keeps the snapshot reason; prune failure appears on the status. |
| 7 | Lower | The readiness test captured the scheduler callback and invoked it by hand. | The test now drives the real `setImmediate` scheduler through a real `/health` probe; no capture, no manual invocation. |
| 8 | Lower | The only encrypted test was skipped without stating scope. | Renamed to `NOT COVERED: encrypted snapshot openable with the key in force — needs the SQLCipher binding (#410)`, with a scope comment; `backup.snapshot.test.ts` says the keyed test is not an encryption test. |
| 9 | Lower | Docs said rotation cannot happen, but the app has a rotation path. | `docs/backups.md` now states rotation re-encrypts the live DB only; a snapshot opens only with the key in force when taken; cross-references the parked encryption work (#435) and the unproven SQLCipher build (#410). |

## Spec axis

Unchanged scope: the database only (attachments parked in #433). Behaviour is
strictly more conservative now: the feature never touches a directory it did not
create, and it never reports a snapshot it did not verify.

## Standards axis

- `src/modules/backup/**` stays at 100% statements/branches/functions/lines.
- The worker body is an inline string (documented reason: it must load from both
  the tsx ESM dev server and the bundled CJS artifact without a second build
  artifact). The one CJS-only `import.meta.url` reference is guarded by
  `__filename`; its build warning is silenced with a comment.
- No `any`; explicit staging; no generated artifacts committed; `pnpm build`
  restored no tracked artifact.

## Deliberately accepted

- `.staging-*` cleanup still removes any folder with that prefix; the prefix is
  feature-specific and the marker requirement is what protects dated folders.
- A future-dated folder we own is left on disk rather than deleted; it is
  excluded from listing/retention and cannot suppress a backup.
- `lastFailure` is per-process; the durable staleness signal remains the newest
  backup folder's date.
- Encryption is parked (#410/#435); the encrypted copy is unverified and the
  tests say so.
