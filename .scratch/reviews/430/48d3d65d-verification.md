# #430 verification evidence (PR #434 review + fixes, final HEAD `48d3d65d`)

- worktree: `worktrees/feat-daily-backups`, branch `feat/430-daily-backups`
- base: `origin/develop` @ `edf1e5b3`
- fix commits: `9f6116cb`, `8408c4e0`, `48d3d65d`
- tier: Standard
- PR: #434 (parent-owned)

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/api exec vitest run src/modules/backup --maxWorkers=2 --coverage --coverage.include="src/modules/backup/**/*.ts" --coverage.reporter=text` | **exit 0** — 4 files, 69 passed / 1 skipped; **100%** stmts (260/260), branches (96/96), funcs (56/56), lines (233/233) |
| `pnpm typecheck` | exit 0 (4 tasks) |
| `pnpm lint` | exit 0 — 0 errors (1658 pre-existing warns); `[check:unslop] PASS` |
| `pnpm test:api` (run 1, before the watchdog fix) | exit 0 — 78 files, 1428 passed / 2 skipped |
| `pnpm test:api` (run 2, final HEAD) | exit 1 — 3 **timeout** flakes: `update-history.service.test.ts` hook timeout (pre-existing, documented), `sqlite-bootstrap.port.test.ts` cross-connection test timeout (pre-existing, documented), and `backup.service.test.ts > surfaces a prune…` (5s test timeout under load). No assertion failures. |
| `pnpm --filter @tuari/api exec vitest run src/modules/backup/backup.service.test.ts --maxWorkers=1 -t "surfaces a prune the filesystem refused"` | exit 0 — passes standalone |
| `pnpm --filter @tuari/api exec vitest run src/modules/backup --maxWorkers=1` | exit 0 — 69 passed / 1 skipped |

Only two full-suite runs were made (the first was clean; the second hit the known
load class). The backup timeout was re-verified standalone immediately after.

## Red proof (tests fail on the pre-fix code)

Each behavior fix was proven by stashing the source change (keeping the tests)
and running the suite.

1. `git stash push -- backup.service.ts backup.scheduler.ts`, then
   `pnpm --filter @tuari/api exec vitest run src/modules/backup --maxWorkers=2`
   → **exit 1, 8 failed**:
   - `tolerates an injected timer that returns nothing`
   - `reports a non-empty reason for a thrown empty string`
   - `replaces OUR OWN unusable snapshot at the target instead of wedging forever`
   - `takes a fresh backup when the newest snapshot is future-dated`
   - `does not count a marker whose takenAt is not a timestamp`
   - `seeds lastSuccessAt from the marker's takenAt, not the folder mtime`
   - `keeps a foreign .staging-* directory it did not create`
   - `keeps a .staging-* file and an unreadable .staging-* directory`
2. `git stash push -- backup.snapshot.ts`, then
   `vitest run src/modules/backup/backup.snapshot.test.ts -t "terminates the worker"`
   → **exit 1, 1 failed** (`terminates the worker and rejects when the copy times out`).
3. `git stash push -- backup.service.ts` (the finding-15 change only; the earlier
   service fixes are committed), then `vitest run src/modules/backup/backup.service.test.ts`
   → **exit 1, 1 failed**: `clears a construction-time root failure once the root can be listed`.
   `keeps a real run failure across a later not-due start` passes on pre-fix code
   (it is the survival invariant, not the red behavior).

After each stash, the fix was restored and the scoped suite re-run green.

Tests that are **coverage pins, not behavior changes** and therefore pass on
pre-fix code: the `renameSync` failure test, the quoted output path, the real
`unref` assertion, the ISO-week year-boundary policy test, and the tightened
keyed-path matcher. `does not count a directory named like the database…` is a
behavior fix whose red proof is platform-dependent (Windows `stat.size` for a
directory is 0, so pre-fix already rejected it; POSIX would accept it).

## Not verified

- Encrypted (SQLCipher) snapshot openability: the native binding is not built
  in this workspace (#410); the skipped test and the docs record this. The
  keyed-path test only pins that a failure is reported, not that a copy is
  decryptable.
- The corrected-clock future-snapshot orphaning (documented limitation) has no
  runtime test; it is a property of the deliberate future-date exclusion.
