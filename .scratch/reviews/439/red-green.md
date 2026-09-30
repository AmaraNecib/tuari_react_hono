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
