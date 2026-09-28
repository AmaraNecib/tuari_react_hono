# #430 code review (lane self-review)

- final non-scratch HEAD: `79af0333`
- reviewed code HEAD: `979e66a` (`feat(backup): daily local database backup on startup (part of #430)`)
- code→evidence delta: `46a75b3` adds only `.agents/wisdom/architecture.md` (the fail-soft lesson from finding 3); `79af0333` drops one stale `selectBackupsToPrune` comment left by the scope cut (no behavior change)
- base: `origin/develop` @ `1dc6191`
- tier: Standard
- scope: `apps/api/src/modules/backup/**`, `packages/contracts/src/backup*`,
  config resolver/schema, router handler, composition root, `index.ts`,
  `docs/backups.md`, `apps/api/.env.example`.
- Note: this is the lane's own Standards + Spec pass (the brief's binding
  gates), not the parallel `code-review` skill run. The parent's hosted Greptile
  pass is the independent check on the pushed PR.

## Spec axis (issue #430 + parent scope cut)

| Requirement | Where | Status |
| --- | --- | --- |
| Runs on startup | `index.ts` fires `runDueBackup()` after `serve` | met |
| Due if newest backup older than a day | `isBackupDue` (calendar-day compare) | met |
| Dated folder for the period just ended | `previousDay` → `<YYYY-MM-DD>/tuari.sqlite` | met |
| `VACUUM INTO` (consistent live snapshot) | `runDueBackup` | met |
| Retention N daily + M weekly + K monthly, one constant | `BACKUP_RETENTION` 14/8/6 + `selectBackupsToPrune` | met |
| Prune oldest-first, never newest | `selectBackupsToPrune` explicit newest guard; pinned | met |
| Never block startup; failure non-fatal + logged | `runDueBackup` catches all; `index.ts` no await | met |
| Status read behind auth | `backupStatus` via `m.queryAuth` | met |
| Injected-clock tests (due / not-due / in-flight readable / retention / failure) | `backup.*.test.ts` | met |
| Docs incl. limitation | `docs/backups.md` | met |
| Attachments backed up | **dropped by parent scope cut**, stated in `docs/backups.md` | Part of #430 |

## Standards axis

- New module follows the repo shape: `backup.types.ts` (port/types),
  `backup.policy.ts` (pure decisions), `backup.service.ts` (deep module),
  colocated tests. The service takes a narrow `BackupDatabase = { exec }` port,
  so the failure path is testable without real disk faults.
- New module added to `apps/api/vitest.config.ts` coverage include (repo
  convention); held at 100% for statements/branches/functions/lines.
- Config addition is symmetric with `attachmentsRootPath`: env → schema →
  `createAppConfig`; a `CreateAppDependenciesConfig` seam exists for tests.
- No `any`; `noUncheckedIndexedAccess` satisfied with the repo's `!` convention.
- Explicit staging discipline honoured: named `git add`, no generated artifacts
  (`dist/`, `.turbo/`, coverage are all ignored).
- No unslop: `pnpm check:unslop` PASS, `docs/backups.md` clean.

## Findings raised and resolved in this pass

1. **`backupsRootPath` required broke a hand-built config** (`auth.test.ts`
   `appConfigSchema.parse`). Caught by the full suite; field added to the
   fixture. Real, fixed.
2. **Default clock/logger functions were uncovered**, and the default logger
   used `console.error` for the success line. Changed to a leveled
   `{ info, error }` logger (`console.log` / `console.error`) and added two
   no-injection tests so both defaults actually execute.
3. **A backups root that is a file threw at construction** (`readdirSync`
   ENOTDIR inside `seedStatusFromDisk`), which would block startup — the exact
   thing the issue forbids. Replaced the `existsSync` guard with an
   `isDirectory` guard that returns false instead of throwing, plus a
   file-root test. The run then reports the failure non-fatally. Captured as a
   wisdom entry.
4. **The `already-exists` result branch was unreachable**: the due rule is
   `newest < yesterday`, so a folder for `yesterday` can never exist when the
   run fires. Deleted the branch and its variant rather than keeping dead code.
5. **Unused `eslint-disable`** in the service test removed after lint flagged it.

## Deliberately accepted (documented)

- Attachments are not backed up (parent scope cut); `docs/backups.md` states a
  restored database may reference files that are gone and that this is tracked
  separately.
- `lastFailure` is per-process. The run happens on every start, so a
  still-failing host repopulates it immediately; the durable staleness signal
  is the newest backup folder's date, also in the status payload.
- SQLCipher is not built in this worktree, so the encrypted-copy path is not
  exercised; `VACUUM INTO` is the documented cross-mode primitive and produces
  an encrypted output when the source is encrypted.
- The run is synchronous and fires after `serve()`. A very large database
  briefly delays the first request but cannot prevent binding; `VACUUM INTO`
  cannot interleave with an open transaction because the body is synchronous.
