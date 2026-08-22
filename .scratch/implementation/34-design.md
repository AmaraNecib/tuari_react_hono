# Issue #34 — Invoice details page: error surface for invalid/404 invoice id (no more infinite loading)

**Issue:** #34 · **Tier:** Standard · **Base:** `fbb7d02` (origin/develop)
**Source:** crew lane brief (mode: pipeline). Remote repo available — parent
owns push/PR; lane pushes the branch, never merges.

## Problem

`apps/web/src/features/inventory/inventory-invoice-details-page.tsx`
(route `/invoices/:id`) renders an infinite loading state when the
invoice-group query is in `isError` (invalid or 404 id):

- The header surface shows `{detail ? (…) : <p>جارٍ تحميل بيانات الفاتورة...</p>}`
  — when the query errors, `detail` is `undefined` forever, so the page stays
  on the "loading" line with every other section empty and no way to retry.
- The id-present-but-data-undefined path (`invoiceId` set, query settled,
  `data` undefined) falls into the same falsy branch → same infinite loading.

## Target

Mirror the existing `DebtsLoadError` pattern used by the debts/employees/
externals detail surfaces (`home-view-page-content-detail-pages.tsx`):
an error surface with icon + message + retry when the invoice-group query
`isError`, covering the has-id-but-no-data case too. `isPending` keeps a
loader. Success rendering unchanged.

## Design

Single component change in `inventory-invoice-details-page.tsx` plus an i18n
key. No RPC/API, hooks, or contract changes.

### 1. `apps/web/src/features/inventory/inventory-invoice-details-page.tsx`

Keep all hooks at the top (rules of hooks), then gate rendering before the
success layout, exactly like the debts detail pages:

```tsx
if (invoiceQuery.isPending)            → loader (existing "loading" text)
if (invoiceQuery.isError || !detail)   → <InvoiceLoadError onRetry={() => void invoiceQuery.refetch()} t={t} />
```

- `InvoiceLoadError` is a local component mirroring `DebtsLoadError`
  byte-for-byte in structure: `Surface role="alert" variant="panel"
  border-destructive/25`, `TriangleAlert` icon `aria-hidden`, message from
  `t("detailPages.invoice.loadError")`, `Button variant="outline"` labelled
  `t("common.retry")` that calls `refetch()`.
- Order matters: `isPending` must be checked before `isError || !detail`
  (pending has no data yet, so the `!detail` branch would wrongly shadow it).
- `!detail` covers the has-id-but-no-data case even when the query is not in
  `isError` — the same retryable error surface (matches the shell's
  "workspace data settles without payload" retry state).
- Success rendering (header totals, entries, balances, movements,
  attachments, payment dialog) is untouched.
- RTL-safe: the error surface is flex-centered text (RTL-agnostic), icon is
  `aria-hidden`, `role="alert"` announces the failure to screen readers.
  Matches the a11y error-handling pattern (WCAG 3.3.1: icon + text + action).

### 2. `apps/web/src/i18n/resources/ar.ts`

New `detailPages.invoice` block (next to `detailPages.shared`):

```ts
invoice: {
  loadError: "تعذر تحميل بيانات الفاتورة. حاول مرة أخرى.",
},
```

`common.retry` ("إعادة المحاولة") already exists. The pending loader reuses
the page's existing hardcoded "جارٍ تحميل بيانات الفاتورة..." line — no new
`loading` key (the rest of this page's strings are inline Arabic; a lone
loader key would duplicate the string in two places). Review finding: the
initially added `loading` key was dead code and was removed.

## Playwright deferral (parent-mandated)

This round NO Playwright tests are added or run: the crew brief explicitly
assigns the E2E suite to lane #25 (shared e2e DB + reserved ports) and CI runs
the full e2e suite after merge. The error-surface behaviour is covered by
page-level RTL tests instead.

## Tests (RTL, new file `inventory-invoice-details-page.test.tsx`)

Mirror the `DebtsLoadError` test pattern in `home-view.test.tsx` and the
hook-mocking style of `inventory-invoice-create-page.test.tsx` (vi.mock
`./inventory-hooks` + `./record-invoice-payment-dialog`):

1. `isError` → renders the error surface (`role="alert"`, message, retry
   button labelled إعادة المحاولة); loader text absent; no invoice content.
2. Retry click → `refetch` called.
3. id-present-but-data-undefined (settled, not pending, `data: undefined`,
   `isError: false`) → same error surface with retry; no invoice content.
4. `isError` with retained stale data (failed background refetch) → error
   surface wins, stale invoice not shown.
5. `isPending` → loader text visible, no error surface.
6. Success (data present) → renders invoice number heading, totals, entries,
   movements, attachments, back button (existing behavior — regression guard).

## Verification

- `pnpm --filter @tuari/contracts build`
- `pnpm typecheck`, `pnpm lint`, `pnpm test:api`, `pnpm test:web`
- NO Playwright (lane #25 owns the E2E shared DB/ports; CI runs e2e after
  merge).

## Risks

- Early-return error surface drops the page-header back button. Acceptable:
  the shell sidebar navigation stays available (same trade-off as
  `DebtsLoadError`); the error surface also gives the user a retry action.
- The `!detail` branch is a defensive net for a state the RPC layer
  (`requireEntitySuccess`) normally converts to `isError` — unit-tested so it
  cannot silently regress.

## Constraints

- Local worktree `worktrees/issue-34`, branch `fix/issue-34-details-error`,
  base `fbb7d02` = origin/develop.
- Stage only source/config/test/evidence files; no `git add -A`.
- Push allowed after green; parent owns PR/merge.