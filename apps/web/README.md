# @tuari/web

This app is the Vite-powered web shell for Tuari. It uses React, TanStack Router, TanStack Query, Tailwind CSS, and a small Tauri runtime bridge so the same UI can run in browser preview mode or inside the desktop shell.

## Commands

- `pnpm --filter @tuari/web dev` - start the web app on port 3000
- `pnpm --filter @tuari/web build` - type-check and build the Vite bundle
- `pnpm --filter @tuari/web test` - run the web Vitest suite
- `pnpm --filter @tuari/web lint` - run the web ESLint checks

## Environment

Copy `apps/web/.env.example` to a local env file before development.

- `VITE_API_URL` - API base URL used by the browser preview shell
- `VITE_APP_CLIENT_KEY` - client key shared with the local runtime

## Runtime notes

- In a normal browser, the app falls back to preview diagnostics and does not expect Tauri APIs.
- In the desktop shell, the runtime bridge reads config and recent API log output through Tauri commands.
