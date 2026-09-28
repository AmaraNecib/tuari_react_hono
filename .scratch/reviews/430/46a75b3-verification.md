# #430 verification evidence

- final non-scratch HEAD: `46a75b3` (`docs(wisdom): composition-root reads must fail soft (from #430)`)
- reviewed code HEAD: `979e66a` (`feat(backup): daily local database backup on startup (part of #430)`)
- code→evidence delta: `46a75b3` adds only `.agents/wisdom/architecture.md` (docs; no executable change)
- base: `origin/develop` @ `1dc6191`
- worktree: `worktrees/feat-daily-backups`

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass (tsup esm + dts, 375 KB d.ts) |
| `pnpm --filter @tuari/api test -- --maxWorkers=2` | pass: 76 files, 1382 passed, 1 skipped |
| `pnpm typecheck` (turbo, 4 tasks) | pass |
| `pnpm lint` (all repo checks + turbo eslint) | pass, 0 errors |
| `pnpm check:unslop` | `[check:unslop] PASS` (docs/backups.md has 0 warnings) |
| `pnpm --filter @tuari/api build` | pass (tsup dts OK — no TS4058) |
| scoped coverage `src/modules/backup/**` | **100%** statements/branches/functions/lines (132/132, 39/39, 26/26, 119/119) |

Full-suite note: the first full run surfaced one real break (required
`backupsRootPath` missing from `auth.test.ts`'s hand-built config) plus
load-timeouts on the documented flaky files. After the fix, the full suite was
green on the pre-final working state. Two small deltas landed after that run and
were verified by targeted runs on the final code:

- `router.test.ts` backupStatus cases (admin success + anonymous refusal):
  44 passed.
- `backup.service.ts` `isDirectory` guard + file-root test: 23 passed, 100%
  coverage.
- `typecheck` + `lint` re-run clean after both.

The documented load-flaky files (`sqlite-bootstrap.port.test.ts`
cross-connection 5s timeout; `recovery-key.service.test.ts` and
`update-history.service.test.ts` 10s hook timeouts) each passed standalone
(`--maxWorkers=1`) and are pre-existing on this shared machine, not touched by
this change.

## Reproduction

```bash
pnpm install
pnpm --filter @tuari/contracts build
pnpm --filter @tuari/api test -- --maxWorkers=2
pnpm typecheck
pnpm lint
pnpm check:unslop
pnpm --filter @tuari/api exec vitest run src/modules/backup --maxWorkers=2 \
  --coverage --coverage.include="src/modules/backup/**/*.ts" \
  --coverage.thresholds.lines=0 --coverage.thresholds.statements=0 \
  --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 \
  --coverage.reporter=text
```
