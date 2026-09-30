# #430 verification evidence (PR #434 review round 2)

- final code HEAD: `8e240048` (`fix(backup): marker-identified snapshots, off-thread copy`)
- base: `develop` @ `1dc6191`
- worktree: `worktrees/feat-daily-backups`
- tier: Standard
- PR: #434 (parent-owned; a lane never pushes or merges)

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass (esm 84.95 KB, dts 375.65 KB) |
| `pnpm --filter @tuari/api test -- --maxWorkers=2` | **78 files passed; 1416 passed, 2 skipped (1418). One full-suite run.** |
| `pnpm typecheck` (turbo, 4 tasks) | pass |
| `pnpm lint` | pass (0 errors); `check:unslop` PASS |
| `pnpm check:unslop` | `[check:unslop] PASS` (0 errors; `docs/backups.md` 0 warnings) |
| `pnpm --filter @tuari/api build` | pass; no `empty-import-meta` warning (silenced, see tsup config); `dist/index.cjs` 3.04 MB |
| scoped coverage `src/modules/backup/**` | **100%** statements/branches/functions/lines (222/222, 82/82, 47/47, 200/200) |

The two skipped tests are: the encrypted-path `it.skip` in
`backup.service.test.ts` (renamed to state it is NOT covered) and one
pre-existing skip elsewhere in the suite.

## Extra verification for the worker copy

The worker must resolve the SQLite driver in BOTH the ESM dev server and the
bundled CJS output. `resolveDriverModule` prefers `__filename` (CJS bundle) and
falls back to `import.meta.url` (ESM). Verified against the built artifact with
a representative CJS probe run from a different working directory:

```
base-is-bundle: true
resolved-ok: true
```

`import.meta.url` is empty in the CJS bundle (esbuild replaces it with `{}`), so
the `__filename` branch is the one taken in production; the warning is silenced
in `apps/api/tsup.config.ts` with a comment because the guarded branch is the
only user.

## Reproduction

```bash
pnpm install
pnpm --filter @tuari/contracts build
pnpm --filter @tuari/api test -- --maxWorkers=2
pnpm typecheck
pnpm lint
pnpm check:unslop
pnpm --filter @tuari/api build
pnpm --filter @tuari/api exec vitest run src/modules/backup --maxWorkers=2 \
  --coverage --coverage.include="src/modules/backup/**/*.ts" \
  --coverage.reporter=text
```
