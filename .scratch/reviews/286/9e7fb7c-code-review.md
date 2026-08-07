# Code Review — issue #286 (web perf: lazy sections + manualChunks)

Reviewed: `git diff 9aac620...9e7fb7c` (base = `origin/develop @ 9aac620`, head = `9e7fb7c`)
Scope: apps/web only (owned paths per launch contract).

## Standards axis

- **Lazy pattern mirrors the existing detail-page pattern** — `lazy(() => import(...).then((m) => ({ default: m.X })))`
  + `<Suspense fallback={skeleton}>` is the exact idiom already in
  `home-view-page-content-detail-pages.tsx`. No new abstraction invented.
- **No behavior change in rendered output** — each `case` in the section switch
  returns the same component/props as before, only wrapped in `renderSection`.
  The fallback is an `animate-pulse` skeleton with `role="status"` and
  `aria-live="polite"`, consistent with the detail-page fallback.
- **De-barrel is mechanical**: `./mock-dashboard` → concrete `./workspace-mutations`
  / `./workspace-queries` for the exact same named exports. Type-only imports
  were re-pointed the same way. No export signatures changed.
- **vite.config.ts**: `manualChunks` matches on the node_modules package root
  (scope-aware) instead of loose `/react/` substrings, which avoids
  `@base-ui/react` / `react-i18next` being swallowed into `vendor-react`
  (that earlier variant produced Rollup circular-chunk warnings — eliminated).
  Vendor groups match the issue's requested set (react, @tanstack, i18next,
  zod, fuse.js) plus @orpc / better-auth / stable UI libs.
- **Build hygiene**: 0 warnings (no circular chunks, no >500 kB chunk warnings).
- **Windows path safety**: `id.split("\\").join("/")` before matching.

## Spec axis (issue #286 acceptance)

1. Home-view chunk < 250 kB raw → **169.10 kB raw** (41.78 kB gz). ✅
2. First workspace page fetches only its section chunk + shared vendors —
   every section is now its own lazy chunk; home-view imports only vendor +
   router + index chunks. Verified via build output + e2e. ✅
3. `manualChunks` yields stable vendor filenames — verified identical
   filenames across two consecutive clean builds (e.g. `vendor-react-*`,
   `vendor-zod-*`). ✅
4. `pnpm typecheck && pnpm test:web && pnpm lint` green. ✅

## Findings

No actionable findings. Advisory: the `vendor-ui` chunk (~140 kB) groups all
UI libs together; if it ever grows past the 400 kB warning ceiling the groups
could be split further — not needed today.

## Files reviewed

- apps/web/src/features/app-shell/home-view-page-content-sections.tsx
- apps/web/src/features/app-shell/home-view.tsx
- apps/web/src/features/app-shell/employees-section.tsx
- apps/web/src/features/app-shell/home-view-auth-controller.ts
- apps/web/src/features/app-shell/home-view-shell-controller.ts
- apps/web/src/features/app-shell/home-view-signed-in-shell.tsx
- apps/web/src/features/app-shell/home-view-page-content-shared.tsx
- apps/web/src/features/debts/debts-queries.ts
- apps/web/src/features/app-shell/home-view.test.tsx
- apps/web/src/features/app-shell/__test-utils__/workspace-fixtures.tsx
- apps/web/vite.config.ts

Result: **PASS — no actionable findings.**
