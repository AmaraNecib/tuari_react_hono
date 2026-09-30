# Test audit — #439 + #436

Standard tier. Manual audit (the `test-audit` skill is scoped to High-assurance
work, and this lane has no independent-reviewer authorization to spawn the
three sub-agents). Reviewed the new/changed tests against the acceptance
criteria, edge cases, and assertion quality.

## Acceptance coverage

| Criterion | Test |
| --- | --- |
| #439 a recorded failure renders its reason | `backup-settings.test.tsx` → "renders a recorded failure loudly with its reason" |
| #439 a healthy status renders last success time + path | `backup-settings.test.tsx` → "renders the last success time and folder path" |
| #439 never-run must not imply a backup exists | `backup-settings.test.tsx` → "renders the never-run state with an honest explanation" |
| #439 overdue backup visible (task brief) | `backup-settings.test.tsx` → "flags a stale last success as overdue" |
| #436 configured root reaches the sidecar | `config.test.ts` → "resolves the config file's `backups_root` into the backups path"; `backup-folder-persister.test.ts` round-trip with `loadConfigFile` |
| #436 invalid/unwritable root degrades to a recorded failure | `backup.service.test.ts` → "records a failure when the root path is a file, instead of throwing" (plus the existing unreadable-root test) |
| #436 the setting persists | `backup-folder-persister.test.ts` write/preserve/create; `backup-settings.test.tsx` save |
| #436 invalid path rejected with a naming message | `backup.settings.test.ts` (empty/file/mkdir), `router.test.ts` (`setBackupsRoot` file path), `backup-settings.test.tsx` (server error rendered) |
| #436 docs updated | `docs/backups.md` |
| E2E surface reachable | `tests/e2e/backup-settings.spec.ts` |

## Edge cases checked

- empty/whitespace path (`required`), a file at the path, a file as the parent
  (mkdir fails), no config file (`persisted: false`), non-object config file
  (honest failure, file untouched), env `APP_BACKUPS_ROOT` winning over the
  config file, `setBackupsRoot` re-seeds from the new root and the next run
  writes there, unauthenticated `setBackupsRoot` rejected.

## Gaps and judgement

- The backup persister's atomic-rename failure is not exercised directly; the
  shared writer's failure path is covered by the existing DB-key persister
  rename-failure test and by the new non-object test. Adding a second
  rename-failure test for the same writer would be duplicate coverage.
- The desktop "Choose folder" button is not covered (jsdom is not a desktop
  runtime; the picker is a thin wrapper over the existing dialog plugin).
- No test asserts an `overdue` banner reappears after a successful run clears
  it; the transition is `data-state` from `overdue` → `success` on refetch,
  which the two state tests already pin independently.

## Result

No "fix it" findings. Test names describe behaviour; async handlers are awaited;
no duplicate coverage added.
