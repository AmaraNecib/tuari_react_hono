# #430 verification evidence (PR #434 review round)

- final code HEAD: `e838db11` (`fix(backup): gate startup snapshot on readiness, fail soft on a bad root (#430)`)
- base: `develop` @ `1dc6191`
- worktree: `worktrees/feat-daily-backups`

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass (tsup esm + dts, 375.65 KB d.ts) |
| `pnpm --filter @tuari/api test -- --maxWorkers=2` | 1397 passed, 2 skipped, **1 failed** — `sqlite-bootstrap.port.test.ts` cross-connection write-lock test hit its 5s timeout under full-suite load. Documented load-flake; passes standalone (`--maxWorkers=1`, 10/10). No touched code. |
| `pnpm typecheck` (turbo, 4 tasks) | pass |
| `pnpm lint` | pass, 0 errors |
| `pnpm check:unslop` | `[check:unslop] PASS` (`docs/backups.md` has 0 warnings) |
| `pnpm --filter @tuari/api exec tsc --noEmit` | pass |
| `pnpm --filter @tuari/api exec vitest run src/modules/backup` | 36 passed, 1 skipped (the encrypted-path `it.skip`) |
| scoped coverage `src/modules/backup/**` | **100%** statements/branches/functions/lines (161/161, 52/52, 37/37, 144/144) |

Full-suite note: the single failure is the pre-existing load-flaky
`sqlite-bootstrap.port.test.ts` cross-connection test already recorded in the
prior evidence for this branch. It was verified standalone immediately after the
full run and passed 10/10. Nothing in this change touches that module. Per the
brief, only one full-suite run was made.

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
  --coverage.reporter=text
pnpm --filter @tuari/api exec vitest run \
  src/modules/auth/adapters/sqlite-bootstrap.port.test.ts --maxWorkers=1
```
