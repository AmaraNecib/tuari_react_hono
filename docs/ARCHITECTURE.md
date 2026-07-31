# Tuari Starter Architecture

This repository is a local-first desktop starter built around Tauri.

It is designed for:
- shipping a desktop app that runs fully on the user's machine
- bundling a local API with the app
- using one SQLite database for both auth and app data
- sharing contracts between frontend and backend
- serving as a reusable starter template for future projects

## High-Level Design

The app has three main parts:

1. `apps/web`
- React + Vite frontend
- TanStack Router for routing
- TanStack Query for server state
- shadcn/ui for UI primitives
- Better Auth client integration

2. `apps/api`
- Hono HTTP server
- oRPC procedures and shared contracts
- Better Auth server
- Prisma ORM
- SQLite database

3. `apps/desktop`
- Tauri shell
- starts the bundled API as a local sidecar process
- hosts the frontend UI inside the native desktop window
- exposes native commands for runtime info, logs, and auth token handling

## Monorepo Layout

```text
.
|-- apps
|   |-- api
|   |   |-- prisma
|   |   |   `-- schema.prisma
|   |   |-- src
|   |   |   |-- app
|   |   |   |-- infrastructure
|   |   |   |-- modules
|   |   |   `-- rpc
|   |   |-- prisma.config.ts
|   |   `-- tsup.config.ts
|   |-- desktop
|   |   |-- scripts
|   |   |   |-- build-portable.mjs
|   |   |   `-- build-sidecar.mjs
|   |   `-- src-tauri
|   |       |-- src
|   |       |   `-- lib.rs
|   |       `-- tauri.conf.json
|   `-- web
|       `-- src
|           |-- components
|           |-- features
|           |-- lib
|           |-- main.tsx
|           `-- router.tsx
|-- packages
|   `-- contracts
|       `-- src
|           `-- index.ts
|-- docs
|   `-- ARCHITECTURE.md
`-- README.md
```

## Request Flow

Normal desktop runtime flow:

1. User opens `Tuari.exe`
2. Tauri starts
3. Tauri launches the bundled local API sidecar
4. API listens on `127.0.0.1:4318`
5. The embedded frontend connects to that local API
6. Frontend calls the API through oRPC and Better Auth
7. API reads and writes to the local SQLite database

In short:

```text
Tauri window
  -> React frontend
    -> oRPC / Better Auth client
      -> local Hono API on 127.0.0.1:4318
        -> Prisma
          -> SQLite
```

## Shared Contracts

`packages/contracts` is the contract layer between frontend and backend.

Use it for:
- request/response shapes
- oRPC procedure contracts
- shared DTOs and validation boundaries

This keeps the web app and API aligned.

## Auth Model

Auth is real server-side auth. It is not a fake static cookie setup.

Current design:
- Better Auth stores users and sessions in SQLite
- Prisma is the persistence layer
- the desktop UI stores the bearer token in Tauri process memory
- the token is not stored in browser `localStorage`
- closing the app clears that in-memory token

Where auth lives:
- server-side records: SQLite database
- client-side temporary session token: Tauri process memory

This is stronger than browser local storage, but it is still a local desktop app:
- if the machine is compromised, local files and memory can still be inspected
- this is a practical desktop-starter security model, not a hardened enterprise security boundary

## Database Model

The starter uses one SQLite file:

- `projects/default/tuari.sqlite`

That database contains:
- Better Auth tables
- app tables such as todos

This is intentional:
- easier to inspect
- easier to back up
- easier to move between projects
- simpler for a starter template

## Where Data Is Saved

Release runtime data is stored relative to the app runtime folder.

Installed app:
- if installed under `D:\Tuari`, the runtime data is under:
  - `D:\Tuari\projects\default\tuari.sqlite`
  - `D:\Tuari\logs\api-server.log`

Portable app:
- if run from `X:\Tuari-portable`, the runtime data is under:
  - `X:\Tuari-portable\projects\default\tuari.sqlite`
  - `X:\Tuari-portable\logs\api-server.log`

This makes the portable build self-contained and easy to move to USB or another machine.

## Data Layer: Ports & Adapters

The company domain data layer follows a ports-and-adapters pattern so the
backend store can be swapped without touching business logic.

- **Ports** — narrow repository interfaces per domain:
  `WorkforceRepository`, `OperationsRepository`, `FinanceRepository`,
  `AuditRepository`. Domain services depend only on the port they need.
- **SQLite adapters** — `Sqlite*Repository` classes (production, Drizzle over
  better-sqlite3).
- **InMemory adapters** — `InMemory*Repository` classes backed by a shared
  `InMemoryStore` (Maps), selectable for tests/CI.

### Config

`apps/api/src/config/` validates all runtime configuration with Zod
(`createAppConfig`) and exposes adapter factories (`config/database.ts`).
The adapter is selected via `DB_ADAPTER` env var (`sqlite` default, `inmemory`),
with optional `TUARI_CONFIG_FILE` pointing at a user-editable `config.json`
(env vars always override the file). The desktop sidecar passes
`TUARI_CONFIG_FILE` at `%APPDATA%/Tuari/config.json` (or the portable data dir).

## What Lives Only In Memory

These values are intentionally not persisted in browser storage:
- desktop auth bearer token

These values are persisted on disk:
- SQLite data
- backend log file

## Runtime Diagnostics

The frontend can show runtime details from Tauri:
- API base URL
- project folder path
- database file path
- backend log file path
- backend health status

This is useful in a starter because it makes local runtime failures easier to debug.

## API Responsibilities

`apps/api` should stay focused on:
- transport setup
- auth setup
- RPC procedure wiring
- database access
- business logic

Recommended boundaries:

- `src/index.ts`
  - boot the server only
  - no business logic

- `src/app`
  - compose dependencies
  - create the Hono app
  - wire infrastructure to transport

- `src/infrastructure`
  - environment parsing
  - auth provider setup
  - prisma client
  - schema/bootstrap concerns

- `src/modules/<feature>`
  - feature-local types
  - service layer
  - repository contracts
  - repository implementations

- `src/rpc`
  - transport-facing procedure handlers
  - auth guards and request context
  - maps application outcomes to RPC responses

Current API dependency direction:

```text
rpc -> app dependencies -> modules -> infrastructure
```

Practical rule:
- transport may call services
- services may call repositories
- repositories may call Prisma
- transport should not directly own business logic

## Web Responsibilities

`apps/web` should stay focused on:
- UI composition
- route structure
- TanStack Query hooks
- calling the API and displaying results
- runtime diagnostics and desktop integration

Recommended boundaries:

- `src/features`
  - feature modules such as auth, todos, i18n, runtime

- `src/components`
  - generic UI and shadcn-based components

- `src/lib`
  - low-level clients and utilities

This is a better starter structure than putting everything in one `pages` or `lib` folder.

## Desktop Responsibilities

`apps/desktop` is the native runtime boundary.

It owns:
- starting the local API process
- stopping the API process when the app exits
- resolving runtime file paths
- opening project/log folders
- exposing native commands to the frontend

Important files:
- [lib.rs](D:/projects/tuari_react_hono/apps/desktop/src-tauri/src/lib.rs)
- [build-sidecar.mjs](D:/projects/tuari_react_hono/apps/desktop/scripts/build-sidecar.mjs)
- [build-portable.mjs](D:/projects/tuari_react_hono/apps/desktop/scripts/build-portable.mjs)

## Build Pipeline

Desktop build path:

1. Generate Prisma client
2. Build the API bundle
3. Collect runtime dependencies for the API sidecar
4. Copy `node.exe` for the sidecar runtime
5. Build the web app
6. Build the Tauri app
7. Optionally assemble a portable folder and zip

Commands:

```powershell
pnpm run build:desktop
pnpm run portable:desktop
```

## Portable Behavior

Portable mode is intended to be self-contained.

Rules:
- keep the full portable folder together
- do not move only the exe without its `bin` folder
- database and logs should live beside the portable app

That makes it a good starter for:
- offline internal tools
- client-side desktop utilities
- USB-carried local tools

## Why This Is A Good Starter Base

This template already gives you:
- monorepo separation
- shared contracts
- desktop shell
- local bundled backend
- real auth
- Prisma ORM
- SQLite persistence
- TanStack Query
- TanStack Router
- shadcn/ui
- EN/AR and LTR/RTL support

That is enough to start new apps without rebuilding the infrastructure each time.

## Template Rules For Future Work

When you reuse this starter, keep these rules:

1. Keep contracts shared
- frontend and backend should agree through `packages/contracts`

2. Keep the API local-first
- do not mix desktop-only assumptions with future internet deployment assumptions unless you split profiles cleanly

3. Keep one clear runtime owner
- Tauri owns process startup, shutdown, logs, and file paths

4. Keep the frontend thin
- move business rules to API modules and shared contracts

5. Keep feature folders explicit
- prefer `features/auth`, `features/todos`, `features/runtime`, `features/i18n`

6. Keep generated and build artifacts out of template docs
- document source files, not `dist` or `target`

## Suggested Next Improvements Before Publishing Publicly

If you want this to be a public starter, these are the next good improvements:

1. Add a `docs/CONTRIBUTING.md`
- explain how to add a new feature module

2. Add smoke tests
- API health test
- portable launch test

3. Add template placeholders
- app name
- package prefix
- default product identifier

4. Add project-switching support
- choose another SQLite file or project folder from the UI

5. Add stronger auth storage
- OS keychain instead of only memory-backed token state

6. Clean build leftovers from the repo
- ensure temp and build artifacts are gitignored and not documented as source

7. Add repository tests and service tests
- keep business rules verifiable without booting the full Hono server

## Short Operational Summary

If you come back to this template later, remember this:

- the UI is in `apps/web`
- the API is in `apps/api`
- the desktop shell is in `apps/desktop`
- shared RPC contracts are in `packages/contracts`
- auth and app data are in one SQLite file
- logs are written to `logs/api-server.log`
- the desktop app starts the API for you
- the portable build keeps runtime data next to the portable app
