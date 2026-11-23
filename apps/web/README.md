# @tuari/web

This app is the Vite-powered web shell for Tuari. It uses React, TanStack Router, TanStack Query, Tailwind CSS, and a small Tauri runtime bridge so the same UI can run in browser preview mode or inside the desktop shell.

## Commands

- `pnpm --filter @tuari/web dev` - start the web app on port 3000
- `pnpm --filter @tuari/web build` - type-check and build the Vite bundle
- `pnpm --filter @tuari/web test` - run the web Vitest suite
- `pnpm --filter @tuari/web lint` - run the web ESLint checks

To use a different web development port, set `WEB_PORT` in the shell before starting the app. For example, in PowerShell:

```powershell
$env:WEB_PORT = "3001"
pnpm --filter @tuari/web dev
```

The Vite development server listens on `127.0.0.1` at that port. `WEB_PORT` defaults to `3000`; invalid values fall back to that default. This changes the web listener only. It does not change the API URL or guarantee that API CORS or authentication settings accept the new origin.

## Environment

Copy `apps/web/.env.example` to a local env file before development.

- `VITE_API_URL` - API base URL used by the browser preview shell
- `VITE_APP_CLIENT_KEY` - client key shared with the local runtime

## Runtime notes

- In a normal browser, the app falls back to preview diagnostics and does not expect Tauri APIs.
- In the desktop shell, the runtime bridge reads config and recent API log output through Tauri commands.
