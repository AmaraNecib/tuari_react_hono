# Tuari Starter Monorepo

Starter stack:
- `apps/web`: React + Vite + TanStack Router + TanStack Query + shadcn/ui
- `apps/api`: Hono + oRPC + Better Auth + Prisma + SQLite
- `apps/desktop`: Tauri desktop shell that starts the local API and hosts the web UI
- `packages/contracts`: shared oRPC contracts

Architecture guide:
- `docs/ARCHITECTURE.md`
- `docs/branch-workflow.md`

Delivery planning:
- `plans/tuari-multi-agent-delivery-plan.md`
- `plans/templates/branch-verification-checklist.md`

API architecture:
- `src/app`: composition and app assembly
- `src/infrastructure`: env, auth, prisma, schema bootstrap
- `src/modules`: feature services and repositories
- `src/rpc`: transport boundary only

## What this starter does
- Runs fully local through Tauri. No internet deployment step is required.
- Ships a local bundled API runtime inside the desktop app.
- Uses one SQLite file for both auth and app data.
- Keeps the desktop auth token in the Tauri app process memory instead of browser `localStorage`.
- Supports English and Arabic with LTR and RTL layout switching.

## Prerequisites
- Node.js 22+
- pnpm 10+
- Rust toolchain with Windows desktop build support

## Install
```bash
pnpm install
```

## Local development
Run the web app and API in the browser:
```bash
pnpm dev
```

Run the desktop app locally:
```bash
pnpm dev:desktop
```

## Build the local Tauri app
```bash
pnpm --filter @tuari/desktop build
```

This build:
1. Generates the Prisma client
2. Bundles the API into a local Node sidecar runtime
3. Copies the Prisma runtime files
4. Builds the Tauri desktop installer

## Runtime data
Release builds store project data next to the installed app folder:
- `projects/default/tuari.sqlite`
- `logs/api-server.log`

The UI exposes the exact active paths and can open the project folder or log folder directly.

## Portable usage
After building, a portable folder and zip are available under:
- `apps/desktop/src-tauri/target/release/bundle/portable/Tuari-portable`
- `apps/desktop/src-tauri/target/release/bundle/portable/Tuari-portable.zip`

Keep the whole portable folder together. You can copy that folder to a USB drive and run `Tuari.exe`.

## Desktop outputs
- Installer:
  - `apps/desktop/src-tauri/target/release/bundle/nsis/Tuari_0.1.0_x64-setup.exe`
- Portable executable folder:
  - `apps/desktop/src-tauri/target/release/bundle/portable/Tuari-portable`

## Auth model
- Better Auth creates real server-side users and sessions in SQLite.
- The desktop client stores the bearer token in Tauri memory, not in persistent browser storage.
- Closing the desktop app clears that in-memory token.

## Starter notes
- oRPC endpoints are restricted by origin and client key.
- The server status badge in the top corner expands into diagnostics and log output.
- Full shadcn/ui components are scaffolded in `apps/web/src/components/ui`.
