## Stale contracts `dist/` masks schema changes from API tests (🟡 Minor)

On #234, running `pnpm --filter @tuari/api test` directly after editing
`packages/contracts/src/security.ts` produced ONE failing router test even
though the new contract tests passed. Cause: `@tuari/contracts` resolves via
`dist/index.js` (tsup build output), so the API suite validated the OLD
schema. The root `test:api` script is `pnpm --filter @tuari/contracts build
&& pnpm --filter @tuari/api test`. It builds first; running the API filter
alone skips the rebuild (turbo `typecheck` also builds it, but not every
iteration path does).

**Always**: after ANY change under `packages/contracts/src/`, rebuild
`pnpm --filter @tuari/contracts build` before running the API suite
directly, or just use the root `pnpm test:api`. A lone failing wire test
right after a contracts edit is a stale-`dist` symptom, not a regression.

