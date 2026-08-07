# Issue #286 — Web perf: lazy-load workspace sections + manualChunks

## Problem

`apps/web/dist/assets/home-view-*.js` is **618.99 kB raw / 175.56 kB gz** (verified
against `develop @ 9aac620`) and is downloaded on every workspace page. Causes:

- `home-view-page-content-sections.tsx` statically imports all 8 section
  components (dashboard, employees, projects, salaries, warehouses,
  system-log, roles, settings), which transitively pull heavy feature UI
  (employee batch create, salary dialog, license/activation/update settings,
  recovery keys, advanced search, …).
- `home-view.tsx` imports the `mock-dashboard` barrel, routing the home-view
  chunk through a re-export seam that keeps the API client (`@/lib/orpc-client`)
  + zod (via `@tuari/contracts` schemas) in the chunk.
- `apps/web/vite.config.ts` has no `manualChunks` / `chunkSizeWarningLimit`, so
  react, @tanstack, i18next, zod, fuse.js land wherever imported.

Detail pages already follow the lazy pattern (`home-view-page-content-detail-pages.tsx`:
one `lazy()` per page, `<Suspense>` skeleton fallback). Sections don't use it.

## Fix (mirror the detail-page pattern)

1. **Lazy-load each section** in `home-view-page-content-sections.tsx`:
   - Convert the 8 static imports to `lazy(() => import("./x-section").then((m) => ({ default: m.X })))`.
   - Wrap each case's render in `<Suspense fallback={sectionFallback}>` via a
     `renderSection(node)` helper (skeleton mirrors the detail-page fallback).
   - `Surface` / `workspaceRoutes` stay static (small shared UI, not worth a chunk).
   - Result: each workspace page loads only its own section chunk + shared vendors.

2. **De-barrel `mock-dashboard` on the home-view critical path**:
   - `home-view.tsx` → import hooks directly from `./workspace-mutations`
     (useAuthSetupStatusQuery, useBootstrapFirstUserMutation, useDemoSessionQuery,
     useDemoSignInMutation, useDemoSignOutMutation, useRemoveWorkspaceRecordMutation,
     useResetWorkspaceMutation, useUpdateAccountSettingsMutation) and
     `./workspace-queries` (useSystemLogQuery, useCompositeWorkspaceQuery).
   - `employees-section.tsx` → `useDeleteEmployeeMutation` / `useLeaveEmployeeMutation`
     from `./workspace-mutations`.
   - Type-only barrel imports in `home-view-auth-controller.ts`,
     `home-view-shell-controller.ts`, `home-view-page-content-shared.tsx`,
     `home-view-signed-in-shell.tsx` → point at `./workspace-mutations`.
   - `mock-dashboard.ts` remains as a test seam (fixtures `vi.mock` it; unit tests
     import it directly); no production module on the home-view path imports it anymore.

3. **`manualChunks` in `apps/web/vite.config.ts`** for stable vendor groups:
   - `vendor-react`: react, react-dom, scheduler
   - `vendor-tanstack`: @tanstack/*
   - `vendor-i18next`: i18next, react-i18next
   - `vendor-zod`: zod
   - `vendor-fuse`: fuse.js
   - `vendor-orpc`: @orpc/* (API client — issue: keep API client out of home-view)
   - `vendor-auth`: better-auth (auth client used by the workspace shell)
   - `chunkSizeWarningLimit: 400` (target home-view < 250 kB raw; other app chunks
     stay comfortably under the limit after vendor extraction).

4. **Tests** (`home-view.test.tsx`): section pages are now async. Convert the
   synchronous section-content assertions (`getBy*` right after `renderWorkspace`)
   to `await screen.findBy*` / `findByRole` for: dashboard, employees,
   employees-create, projects list, warehouses list, transactions, salaries,
   settings. Sidebar/auth/workspace-state tests (shell, not section content) stay
   synchronous.

## Planned tests

- Existing `home-view.test.tsx` suite updated to await lazy section content
  (no new behavior tested — refactor-only).
- Existing `roles-section.test.tsx`, `mock-dashboard.account-settings.test.tsx`,
  `workspace-mutations.test.ts`, `workspace-queries.test.ts` untouched.
- Build verification: `pnpm --filter @tuari/web build` → assert
  `home-view-*.js < 250 kB` raw and stable vendor chunk names.

## Acceptance

- [ ] home-view chunk < 250 kB raw after split
- [ ] first workspace page fetches only its section chunk + shared vendors
- [ ] manualChunks yields stable vendor filenames
- [ ] `pnpm typecheck && pnpm test:web && pnpm lint` green

## Risks

- Lazy sections add a one-frame skeleton on navigation between pages (same as
  detail pages today) — acceptable, matches existing UX.
- `manualChunks` groups all `@tanstack/*` (router + react-query) into one vendor
  chunk; circular-import warnings are possible with function-form manualChunks but
  Rollup resolves them — verify in build output.
- Windows paths in `manualChunks` id: normalize `\` → `/` before matching.

## Deviations from issue text

- "debt/inventory sections" named in the issue are detail pages (already lazy) —
  nothing extra needed there.
- Added `vendor-orpc` / `vendor-auth` groups beyond the issue's explicit list
  because the issue's own goal is keeping the API client + zod out of home-view;
  better-auth rides into home-view today via the auth client used by the shell.
