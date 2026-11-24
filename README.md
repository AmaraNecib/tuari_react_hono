# Tuari

Tuari is a local-first desktop application with a React frontend, a Hono API, and a Tauri shell.

## Start here

- [Architecture guide](docs/ARCHITECTURE.md) explains runtime ownership and persistence.
- [Architecture document index](docs/README.md) links current architecture docs, requirements, and decisions.
- [Engineering workflow](docs/engineering-workflow.md) defines implementation, local verification, review, and CI acceptance.

## Runtime layout

- `apps/desktop` owns desktop process startup, shutdown, native commands, and runtime paths.
- `apps/api` owns HTTP transport, authentication setup, application composition, persistence, and feature behavior.
- `apps/web` owns React routes, UI, and API clients.
- `packages/contracts` owns shared RPC contracts and is built by the workspace contract scripts.

The API process entry point is `apps/api/src/index.ts`. It loads configuration, creates dependencies through `apps/api/src/app/fresh-exact-dependencies.ts`, builds the Hono app, and starts the HTTP server. The desktop shell launches this API as a local sidecar.

The API composition root opens SQLite. Better Auth and account persistence use Drizzle; feature repositories can also use SQL directly. See the [persistence guide](docs/ARCHITECTURE.md#persistence) for concrete adapters and the difference between current source and ADR-001. Feature services and repositories live under `apps/api/src/modules`; `apps/api/src/rpc` maps transport requests to application behavior.

## Development

Install dependencies with `pnpm install`. Run the web and API development processes with `pnpm dev`; run the desktop app with `pnpm dev:desktop`. See the package scripts for current build commands. The desktop build does not generate a Prisma client.

For changes, follow [the engineering workflow](docs/engineering-workflow.md); it defines the affected local checks and CI-final gates. The app stores local data in SQLite; exact runtime paths are resolved by the desktop runtime and exposed in its diagnostics.
