# #430 code review (lane self-review, PR #434 review round)

- reviewed code HEAD: `e838db11` (`fix(backup): gate startup snapshot on readiness, fail soft on a bad root (#430)`)
- base: `develop` @ `1dc6191`
- tier: Standard
- PR: #434 (parent-owned; a lane never merges)
- scope: `apps/api/src/modules/backup/**`, `apps/api/src/index.ts`, config/env
  comments, `docs/backups.md`, `.env.example`, the design doc, and wisdom.

## Round findings (PR #434 review) and resolution

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Critical | The synchronous `VACUUM INTO` ran on the startup path, so a large DB could outlast the desktop's 15s `/health` wait and the shell killed the sidecar. | New `backup.scheduler.ts`: the run is deferred off the current turn and gated on the first `/health` response, with a 30s fallback for an unprobed install. `index.ts` detects `/health` in the fetch wrapper. Test: `/health` is answered while a blocking fake snapshot is still only scheduled. |
| 2 | Major | An unlistable backups root (`isDirectory` true, `readdirSync` throws) aborted construction. | `seedStatusFromDisk` is guarded and degrades to no backups plus a recorded `lastFailure`; tested with a forced `readdirSync` throw (Error and non-Error). |
| 3 | Major | A preflight throw (stale-staging cleanup) happened before the try/catch, so no backup ran while `lastFailure` stayed null. | Preflight (cleanup, listing, due check) moved inside the guarded region; tested with a forced `rmSync` throw. |
| 4 | Major | A correctly named folder without `tuari.sqlite` counted as a backup (suppressed the run, held a retention slot). | `listBackupDates` keeps only folders whose `tuari.sqlite` exists and is non-empty; the target folder is cleared before the rename (rename-onto-existing fails on Windows); tested for both a missing and a zero-byte DB file. |
| 5 | Minor | Docs claimed `APP_BACKUPS_ROOT` moves snapshots on the desktop. | Docs, `.env.example`, and config comments now state it is an API-side variable and the desktop shell does not forward it; a desktop setting is a follow-up. |
| 6 | Minor | A pre-rotation snapshot loses its key after rotation. | Docs state a snapshot is usable only with the key in force when it was taken; rotation is parked and cross-referenced to #410/#433. |
| 7 | Minor | Encrypted-path coverage was claimed but the tests use plain SQLite. | `backup.service.test.ts` names its plain-SQLite scope and carries a skipped test listing what an encrypted-path test needs. |

## Spec axis

Unchanged from the prior pass: the feature still meets #430's scope cut to the
database only. The startup contract is now stronger than "never blocks the
bind": the snapshot never runs before readiness is proven.

## Standards axis

- The scheduler follows the module shape (`backup.scheduler.ts` + colocated
  test); the `src/modules/backup/**` coverage include stays at 100%.
- `@hono/node-server`'s `FetchCallback` takes two arguments, so the wrapper
  matches it (the first attempt with a third `executionCtx` param did not
  typecheck).
- No `any`; explicit staging; no generated artifacts.

## Deliberately accepted

- A snapshot that has started still blocks the event loop while it runs. The
  gate guarantees only that it starts after readiness is proven; the desktop
  proceeds on the first 200.
- `lastFailure` is per-process; the durable staleness signal is the newest
  backup folder's date.
- Encryption is parked (#410) and attachments are parked (#433).
