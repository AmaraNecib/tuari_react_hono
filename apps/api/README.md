# API commands

Run these from the repository root.

| Task | Command | Notes |
| --- | --- | --- |
| Develop | `pnpm dev:api` | Root wrapper checks web tracking, builds `@tuari/contracts`, then starts the API watcher. |
| Develop without preparation | `pnpm --filter @tuari/api dev` | Runs `tsx watch src/index.ts`; it does not build contracts first. |
| Run API tests | `pnpm test:api` | Root wrapper builds contracts, then runs the API Vitest suite. |
| Run one test file | `pnpm --filter @tuari/api exec vitest run src/config/config.test.ts` | Runs only the selected file; it does not build contracts first. |
| Build | `pnpm --filter @tuari/api build` | Runs `tsup` using `apps/api/tsup.config.ts`. The entry is `src/index.ts`. |
| Start built API | `pnpm --filter @tuari/api start` | Runs `node dist/index.cjs`. Build first; `start` does not watch source. |
| Lint | `pnpm --filter @tuari/api lint` | Runs ESLint in the API package. |
| Typecheck | `pnpm --filter @tuari/api typecheck` | Runs TypeScript with `--noEmit`. |

See the [contracts README](../../packages/contracts/README.md) for preparing generated contract exports. See the [engineering workflow](../../docs/engineering-workflow.md) for applicable verification requirements. A focused test file is not a substitute for the workflow's required affected tests and checks.

For configuration context, see the [architecture documentation](../../docs/ARCHITECTURE.md) and the API's [configuration source](src/config/). This command reference does not add environment or setup instructions.
