# Worktree dependency ownership

Each manager lane has one canonical source tree and owns its mutable `node_modules` and generated output. Share the pnpm content-addressed store, not a mutable `node_modules` directory or contracts build output.

Supported root commands (`build`, `typecheck`, `test`, `lint`, `dev`, `dev:api`, `dev:web`, `test:api`, `test:web`) and direct API, web, and contracts `test`, `typecheck`, `build`, and `dev` scripts run `node scripts/dev/check-worktree-contracts.mjs --ownership-only` before tools that consume or write installed dependencies. This check allows missing installation directories during clean setup. The full command without `--ownership-only` also requires API/web links and declared contracts export files, so run it after contracts build and before tests that consume exports.

This guard checks ownership, not source freshness. It cannot prove that generated files came from current source, and arbitrary direct tool invocations bypass package scripts. API tests through the root `test:api` build contracts first. Shared pnpm immutable storage is allowed.
