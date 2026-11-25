# @tuari/contracts

Shared TypeScript and oRPC contracts used by the API and web app.

## Source and package entry

Edit files under `src/`. The package's `main`, `types` and `exports` entries point to generated `dist/index.js` and `dist/index.d.ts`, produced from `src/index.ts`. Consumers importing `@tuari/contracts` therefore resolve the built package, not the source tree. `dist/` is ignored build output; do not commit it.

## Root-invoked commands

Run these from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | Builds JavaScript and declarations into `dist/`. |
| `pnpm --filter @tuari/contracts dev` | Watches `src/index.ts` and rebuilds as source changes. |
| `pnpm --filter @tuari/contracts test` | Runs the package's Vitest tests. |
| `pnpm --filter @tuari/contracts typecheck` | Runs TypeScript with `--noEmit`. |
| `pnpm test:contracts` | Root shortcut for the package tests. |
| `pnpm test:api` | Builds contracts, then runs the API test script. |

Package tests check contracts behavior; they do not verify API route wiring. When running API tests directly with `pnpm --filter @tuari/api test` after changing contract source, first run `pnpm --filter @tuari/contracts build` so the API resolves the updated `dist/`. The root `pnpm test:api` already performs that build.
