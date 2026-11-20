# Architecture guide

This guide is an onboarding map of the current implementation. Accepted architectural decisions remain in their decision documents; this guide does not replace or amend them.

## Runtime ownership

The normal desktop flow is:

1. Tauri starts the local API sidecar and hosts the web UI.
2. The API entry point, `apps/api/src/index.ts`, loads configuration, composes dependencies, creates the Hono app, and listens on the configured address.
3. The web frontend calls the local API through the shared RPC contracts and Better Auth client.
4. API feature services use repository ports backed by the configured database adapter.

`apps/desktop/src-tauri/src/lib.rs` owns native startup, shutdown, and desktop commands. `apps/desktop/scripts/` contains sidecar and portable packaging scripts. `apps/api/src/app/dependencies.ts` owns API dependency composition; `apps/api/src/app/create-app.ts` assembles the Hono application. Feature behavior belongs under `apps/api/src/modules/`, while `apps/api/src/rpc/` owns transport-facing handlers and request context. The frontend's routes and feature UI live under `apps/web/src/`.

## Persistence

The [API composition root](../apps/api/src/app/dependencies.ts) opens the SQLite connection, runs migrations, and creates the Drizzle handle. [Database configuration](../apps/api/src/config/database.ts) selects the company repository adapter. [Better Auth](../apps/api/src/infrastructure/auth/auth.ts) and the [account repository](../apps/api/src/modules/account/account.repository.ts) use Drizzle. Other repositories can use the SQLite handle directly, as the [payment repository](../apps/api/src/modules/payment/adapters/payment.repository.ts) does through prepared SQL statements.

[ADR-001](architecture-decisions.md) records Prisma for auth and account persistence. That part of the accepted record differs from current source, which uses Drizzle. This guide documents the implementation; it does not supersede the decision.

The desktop runtime resolves its data directory and database path. Do not assume a fixed path relative to the installed executable; consult the current runtime-path implementation and diagnostics in `apps/desktop` for the active platform and mode.

## Contracts and builds

`packages/contracts` defines shared API contracts. Its package scripts own contract compilation. The root and desktop package scripts define app build orchestration; inspect `package.json` and the relevant package scripts before relying on a command or assuming that a desktop build generates contracts or a Prisma client.

## Finding behavior

- Startup and server lifecycle: `apps/api/src/index.ts` and `apps/api/src/app/`.
- Database and repository composition: `apps/api/src/config/database.ts` and `apps/api/src/infrastructure/database/`.
- Feature rules and persistence ports: `apps/api/src/modules/`.
- HTTP and RPC boundary: `apps/api/src/rpc/` and `apps/api/src/app/create-app.ts`.
- Desktop process and paths: `apps/desktop/src-tauri/src/` and `apps/desktop/scripts/`.
- Frontend routes and behavior: `apps/web/src/`.
- Shared request and response contracts: `packages/contracts/src/`.

For affected tests and review requirements, use the [engineering workflow](engineering-workflow.md). This guide does not duplicate its verification policy.
