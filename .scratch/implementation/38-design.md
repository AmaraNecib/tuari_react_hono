# Issue 38 — Shared LoadErrorSurface primitive

## Summary

Extract one shared presentation-layer primitive `LoadErrorSurface` from the
three structurally identical "icon + message + retry" surfaces that were
hand-rolled inline in feature pages, and swap every duplicate call site onto
it. Visual output at each site stays byte-identical.

Mode: remote-for-push (parent owns push/PR). Base: `origin/develop` @
`842f6ea` — the worktree HEAD is exactly on it (local `develop` ref is stale
at `389336a`, an ancestor; not used). Review tier: **Standard** (code + UI +
tests).

## The duplicates found

Searched with ripgrep for `TriangleAlert`, `role="alert"`,
`إعادة المحاولة`, `loadError`, `isLoading`/`isError` + `refetch` across
`apps/web/src`.

1. `features/app-shell/home-view-page-content-detail-pages.tsx`
   — `DebtsLoadError` (4 call sites: debts hub, externals, employee debts
   tab, external details). `Surface role="alert" className="border-destructive/25 p-6"` +
   `TriangleAlert h-10 w-10 text-destructive` + `debts.loadError` +
   `common.retry`.
2. `features/inventory/inventory-invoice-details-page.tsx`
   — `InvoiceLoadError` (issue #34). Same shape as #1, `detailPages.invoice.loadError`.
3. `features/license/license-settings.tsx`
   — inline loading + error gates. Different visual dialect: no destructive
   accent, `ShieldAlert h-12 w-12 text-muted-foreground`, message
   `text-muted-foreground` (no `max-w-md`), `py-12` inner, `p-5` outer, plus a
   loading state (`common.loading`).

The issue's "likely site" `app-shell/dashboard-section.tsx` was inspected and
deliberately left untouched: it uses retained-data placeholders (`…`/`—`) with
the `isError && data === undefined` guard and has no retry surface — per the
brief, that logic stays in the caller and is not flattened into the primitive.
`dashboard-overview.tsx` (error banner, no icon/retry) and
`audit-log-page.tsx` (inline table-row error cell) are different shapes and
out of scope.

## Primitive API

`apps/web/src/features/shared/load-error-surface.tsx` — presentation layer:
receives already-translated strings (repo convention, matches
`MissingRecordState` / `EmptyState`), no i18n/query dependency, no data logic.

```
LoadErrorSurfaceProps:
  isLoading?: boolean      — render centered loading state
  isError?: boolean        — default true when not loading; render error state.
                            Explicit false → render children bare (content slot)
  message: string          — translated error message
  loadingLabel?: string    — translated loading label
  retryLabel: string       — translated retry label (existing common.retry)
  onRetry: () => void      — retry action
  icon?: ComponentType<{className?: string}>  — lucide icon; default TriangleAlert
  className?: string       — extra outer Surface classes
  contentClassName?: string — extra centered-container classes
  iconClassName?: string   — extra icon classes
  messageClassName?: string — extra message classes
  children?: ReactNode    — slot: rendered inside the error surface below the
                            retry button, or bare when isError === false
```

Defaults preserve the debts/invoice dialect
(`border-destructive/25 p-6`, `TriangleAlert h-10 w-10 text-destructive`,
`max-w-md text-sm leading-6 text-foreground`, `py-10`, `role="alert"`);
license passes `className="p-5" contentClassName="py-12"`, `ShieldAlert`,
`iconClassName="h-12 w-12 text-muted-foreground"`,
`messageClassName="text-muted-foreground"` to keep its dialect.

Rendering rules (no caller data logic inside):
- `isLoading` true → loading surface (`flex items-center justify-center py-12`,
  `text-sm text-muted-foreground`, `role="status"`).
- not loading && `isError !== false` → error surface (`role="alert"`,
  icon + message + retry button, optional children below the button).
- not loading && `isError === false` → children bare (content slot).

## i18n

No new keys needed — every string already exists in `ar.ts`
(`debts.loadError`, `detailPages.invoice.loadError`, `license.loadError`,
`common.retry`, `common.loading`). Callers resolve strings via `t()` before
passing them, so the i18n-keys gate (`check:i18n-keys`) sees only existing
keys. The primitive itself references no keys.

## Caller changes

- `home-view-page-content-detail-pages.tsx`: delete `DebtsLoadError` +
  now-unused `TriangleAlert`/`TFunction`/`Button`/`Surface` imports; 4 usages
  become `<LoadErrorSurface message={t("debts.loadError")} retryLabel={t("common.retry")} onRetry={...} />`.
- `inventory-invoice-details-page.tsx`: delete `InvoiceLoadError` + unused
  imports; usage becomes the same shape with `detailPages.invoice.loadError`.
- `license-settings.tsx`: the two early-return gates render
  `<LoadErrorSurface ... />` with the license dialect props; the success card
  keeps its own `Surface` untouched.

## Tests

New focused unit suite `features/shared/__tests__/load-error-surface.test.tsx`:
1. loading renders the loading label (no retry button / no alert role)
2. error renders icon + message + retry (role="alert", button label)
3. retry click calls `onRetry`
4. children slot renders inside the error surface
5. custom props (custom icon, className, iconClassName, messageClassName) render
   without breaking
6. `isError === false` renders the content slot bare (caller owns the surface)

Existing suites stay green and are the backward-compat net:
`inventory-invoice-details-page.test.tsx` (role="alert", message, retry click →
refetch), `license-settings.test.tsx` (loading/error strings), and
`home-view.test.tsx` (debts load-error text).

## Validation gates

- `pnpm --filter @tuari/web test` (full web suite — several pages touched)
- `pnpm typecheck` && `pnpm lint` (includes i18n-keys + unslop gates)
- No `test:api` (no api changes), no `test:e2e` (unit-only round).

## Risks / notes

- Unifying three surface shapes with class knobs is the minimal-risk way to
  keep each site's exact spacing/classes; defaulting `isError` to true lets
  branch-only callers (debts/invoice) render nothing extra.
- Adding `role="alert"` (error) / `role="status"` (loading) is a pure a11y
  addition — no test asserts their absence.
- Out-of-scope shapes noted above stay untouched; the dashboard retained-data
  guards are not moved into the primitive.