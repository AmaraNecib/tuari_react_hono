# Red/green evidence (#439 + #436)

Each new behaviour test was run once against a deliberately-broken
implementation point and once restored. All runs used `VITEST_MAX_WORKERS=2`.
"Red" = the new test fails with the implementation point disabled; "green" =
it passes on the finished diff (verified in the targeted runs recorded in the
handoff).

| # | Behaviour test | Broken implementation point (red) | Observed red failure |
| --- | --- | --- | --- |
| 1 | `config.test.ts` → "resolves the config file's `backups_root` into the backups path when env is unset" | removed the `backups_root` → `APP_BACKUPS_ROOT` mapping in `mergeConfigIntoEnv` | `expected '...\apps\api\backups' to match /[\\/]usb[\\/]backups$/` |
| 2 | `backup.service.test.ts` → "writes the next run into the newly chosen root and reports it" | `setBackupsRoot` no longer assigned the mutable root | `expected '...\backups-a' to be '...\backups-b'` |
| 3 | `backup.settings.test.ts` → "rejects a file at the path, naming the problem" | removed the "exists and is not a directory" branch | `expected true to be false` |
| 4 | `backup-folder-persister.test.ts` → "writes `backups_root` preserving existing fields" | removed `config.backups_root = path` | expected object contained `backups_root`; received did not |
| 5 | `backup-settings.test.tsx` → "renders a recorded failure loudly with its reason" | disabled the failure render branch | `expected null to be truthy` |

Tests that are new-behaviour assertions over a wholly new module (the web
component's never-run/success/save states, the router `setBackupsRoot`
authorization, the persister session-only branch) have no pre-fix counterpart;
the failures above cover the shared implementation points they depend on.

## Fix round — aggressive local review (HEAD `791383dd`)

The review-fix tests were run once against the pre-fix implementation and once
restored. The observed red output is quoted.

| # | Behaviour test | Pre-fix code | Observed red failure |
| --- | --- | --- | --- |
| 6 | `backup.service.test.ts` → "does not adopt a run that finishes after the owner changed the root" | reverted `backup.service.ts` to HEAD | `expected null, received "2026-01-15T07:00:00.000Z"` on `status.lastSuccessAt` |
| 7 | `backup.service.test.ts` → "does not pin an in-flight failure on the root the owner moved to" | reverted `backup.service.ts` | catch guard absent → `lastFailure` set for the old root |
| 8 | `backup.settings.test.ts` → "rejects a folder the process cannot write to" | reverted `backup.settings.ts` to `accessSync` | `expected false, received true` |
| 9 | `backup-settings.test.tsx` → "does not call a session-only save a permanent save" | reverted `backup-settings.tsx` | session-only primary absent; "saved" headline present |
| 10 | `backup-settings.test.tsx` → "shows an error when the save request itself fails" | reverted `backup-settings.tsx` | no catch → no error text |
| 11 | `backup-settings.test.tsx` → "shows the last successful backup even when the last attempt failed" | reverted `backup-settings.tsx` | success block absent under failure |
| 12 | `backup-settings.test.tsx` → "flags a snapshot timestamp that is in the future" | reverted `backup-settings.tsx` | no future banner |
| 13 | `backup-settings.test.tsx` → "says changing the folder does not move existing snapshots" | reverted `backup-settings.tsx` | note absent |
| 14 | `backup-settings.test.tsx` → "shows an error when the desktop folder picker fails" | reverted `backup-settings.tsx` | no picker error |

The reverted-component run failed 7 of the 16 web tests; the reverted service
run failed the two new service tests. Restoring the implementation returned the
suites to green. The remaining new tests (writer protocol, restart chain,
overdue boundary, coverage-only branches) are assertions over new behaviour with
no pre-fix counterpart.
