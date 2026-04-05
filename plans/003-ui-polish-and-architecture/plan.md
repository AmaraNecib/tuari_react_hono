# Plan 003 — UI Polish & Architecture Hardening

**Date:** 2026-04-01  
**Status:** Draft  
**Scope:** Full UI polish pass, i18n audit, theme system, modular components, debt UX fixes, routing guards

---

## Overview

This plan captures all UI/UX issues, architectural gaps, and missing features identified in the current codebase. Each milestone is a focused, independently shippable unit of work.

---

## Milestone 1 — i18n Audit: Eradicate Hardcoded Arabic Text

### Problem
Arabic strings are scattered across JSX and utility files instead of living exclusively in `i18n/resources/ar.ts` (and `en.ts`). This breaks the language abstraction.

### Files with hardcoded Arabic text

| File | What's hardcoded |
|------|-----------------|
| `features/debts/debt-utils.ts` | `getDebtBalanceMeta()` labels ("لنا عنده", "علينا له", "مغلق", etc.), `formatDebtCaseLabel()` fallback ("حالة الدين {N}"), `getDebtEntryTypeLabel()` all entry types |
| `features/debts/debts-hub-page.tsx` | Page title, description, table headers, stat card labels, type badges ("عامل داخلي", "طرف خارجي"), empty state |
| `features/debts/debt-cases-panel.tsx` | Stat card labels, form labels, button text, date labels, empty states |
| `features/debts/debt-ledger-panel.tsx` | All stat labels, form labels, helper text, closure section headers, table headers, empty states |
| `features/debts/debt-create-page.tsx` | Direction option labels ("لنا عنده", "علينا له"), back breadcrumb |
| `features/debts/external-counterparties-page.tsx` | Page title, table headers, button, empty state |
| `features/debts/external-counterparty-details-page.tsx` | Back label, info card labels, empty note |
| `features/debts/debt-party-summary-card.tsx` | Balance label, case count labels |
| `features/debts/record-payment-dialog.tsx` | Button labels, prompt messages |

### Action Items
1. Add all missing keys to `apps/web/src/i18n/resources/ar.ts` under the `debt.*` namespace.
2. Add corresponding English keys to `apps/web/src/i18n/resources/en.ts`.
3. Replace every hardcoded Arabic string with `t('debt.xxx')` calls (pass `t` as a parameter to pure utility functions like `getDebtEntryTypeLabel(t)`).
4. `debt-utils.ts` functions that return display strings must accept a `TFunction` parameter — do not call `useTranslation` inside non-component utilities.
5. Verify no Arabic characters remain outside translation files (add a lint check: `grep -r --include="*.tsx" --include="*.ts" '[ء-ي]' src/features/`).

### New i18n keys (representative, not exhaustive)
```ts
debt: {
  balanceMeta: {
    owedToUs: 'لنا عنده',
    owedByUs: 'علينا له',
    settled: 'مغلق',
    positiveDesc: 'رصيد موجب — الطرف مدين لنا',
    negativeDesc: 'رصيد سالب — نحن مدينون له',
    zeroDesc: 'لا يوجد رصيد مفتوح',
    openStatus: 'مفتوح',
    settledStatus: 'مسوّى',
  },
  entryType: {
    opening: 'رصيد افتتاحي',
    payment: 'دفعة',
    adjustment: 'تعديل',
    settlement: 'تسوية',
    closure: 'إغلاق مقابل حالة أخرى',
  },
  caseFallbackLabel: 'حالة الدين {{index}}',
  hub: {
    title: 'مركز الديون',
    description: '...',
    statsOpenCount: 'عدد الحسابات المفتوحة',
    statsOwedToUs: 'لنا عندهم',
    statsOwedByUs: 'علينا لهم',
    tableParty: 'الطرف',
    tableType: 'النوع',
    tablePhone: 'الهاتف',
    tableCases: 'مفتوحة / الكل',
    tableBalance: 'الرصيد',
    tableMeta: 'الدلالة',
    typeInternal: 'عامل داخلي',
    typeExternal: 'طرف خارجي',
    empty: 'لا توجد حسابات ديون بعد.',
  },
  // ... cases panel, ledger panel, etc.
}
```

---

## Milestone 2 — Internal Debt: Allow Any Employee Regardless of Role

### Problem
The debt creation flow uses `partyType: INTERNAL_WORKER` to filter employees. Confirm whether the query filters by role (`manager` vs `worker`) or simply by employment status. If it filters by role, remove that restriction — any employee in the system should be a valid counterparty.

### Action Items
1. Read `apps/api/src/modules/debts/` and the relevant oRPC query to see how internal party options are fetched.
2. If the query filters `role === 'worker'`, update it to return all employees (no role filter).
3. Update contracts schema if the filter is encoded there.
4. Test that managers appear in the internal party dropdown on the debt creation form.

---

## Milestone 3 — Tab-Based UI for Debt Detail Pages

### Problem
The debt detail page shows multiple cards stacked vertically (cases panel + ledger panel + closure section all visible simultaneously), making the screen noisy and hard to scan.

### Solution
Introduce a `<Tabs>` layout on detail pages. Each major section becomes a tab. The user completes one context at a time.

### Tab Structure for External Counterparty / Worker Debt Detail

```
[ القيود والمدفوعات ] [ الحالات ] [ الإغلاق والتسوية ] [ معلومات الطرف ]
```

Tab 1 — **القيود والمدفوعات** (Ledger): Entry list table with record-payment shortcut  
Tab 2 — **الحالات** (Cases): Case list, create new case, select active case  
Tab 3 — **الإغلاق والتسوية** (Closure): Close-by-another-debt form + closure history  
Tab 4 — **معلومات الطرف** (Party Info): Name, phone, notes  

### Action Items
1. Wrap the detail page layout in `<Tabs defaultValue="ledger">`.
2. Move `DebtCasesPanel` case-list sidebar into Tab 2 content.
3. Move ledger table into Tab 1 content.
4. Move close-against form and closure log into Tab 3.
5. Move party info card into Tab 4.
6. Pass the currently selected case ID via `useState` shared between tabs (or URL search param `?tab=&caseId=`).
7. Apply the same tab pattern to the `debt-create-page.tsx` multi-step wizard — keep the stepper UX but clean up visual density.

---

## Milestone 4 — Debt Closure: Show "Closed By" Information Clearly

### Problem
When a debt case has been closed via another case, the UI shows a generic "أُغلق على هذه الحالة من حالة مرتبطة" without clearly displaying:
- Which specific case it was closed by (its label/note)
- The amount offset
- Alignment of amount and label is inconsistent

### Action Items
1. In `debt-ledger-panel.tsx`, update the closure log card to show:
   - Label: `{closedByLabel} — {date}`
   - Amount: right-aligned, colored (red/green) matching existing sign convention
   - A subtle link/badge to navigate to the related counterparty's case
2. Ensure the `DebtClosureLink` object returned from the API includes the linked case's note/label — if it doesn't, update the API query to join on the linked account's note.
3. Fix column alignment in the closure log cards: amount column should be `text-end` consistently; label/date column should be `text-start`.
4. Add a dedicated empty state when `closureLinks.length === 0`: "لا توجد عمليات إغلاق مرتبطة بهذه الحالة."

---

## Milestone 5 — Sidebar Spacing & Layout Polish

### Problem
- Insufficient padding between the sidebar and the page content area.
- Page content appears cramped against the sidebar edge.

### Action Items
1. In `home-view-signed-in-shell.tsx` (or the layout wrapper), increase the gap between sidebar and main content: change `gap-*` or `ps-*` to a larger value (e.g., `gap-4` → `gap-6`, or add `pe-2` on the sidebar container).
2. Ensure `<main>` content area has `px-6 py-4` minimum padding on all pages.
3. Review `styles.css` sidebar shadow and ensure it doesn't clip page content.
4. Test in both RTL (Arabic) and LTR (English) to verify the logical property (`ps`/`pe`) usage is correct.

---

## Milestone 6 — 404 Page & Route Guards

### Problem
- No 404 / not-found route exists. Unknown paths render nothing or break.
- The `/roles` route exists but is not ready for use. Users should not be able to access it accidentally.

### Action Items

#### 6a — 404 Not Found Page
1. Create `apps/web/src/features/app-shell/not-found-page.tsx`:
   - Simple centered layout with a large "404" heading.
   - Message: translated ("الصفحة غير موجودة" / "Page not found").
   - "Back to Home" button using `WorkspaceLink`.
2. In `router.tsx`, add a catch-all route:
   ```ts
   export const notFoundRoute = createRoute({
     getParentRoute: () => rootRoute,
     path: '*',
     component: NotFoundPage,
   })
   ```
3. Register it as the last route in `routeTree`.

#### 6b — Roles Route Guard
1. Add a `beforeLoad` guard on the `/roles` route that redirects to `/` with a toast notification: "هذه الصفحة غير متاحة بعد."
2. Alternatively, render a `<ComingSoonPage>` component instead of a hard redirect.
3. Remove the `/roles` sidebar nav item or mark it visually as "قريبًا" (coming soon) with a disabled state.

---

## Milestone 7 — Modular UI Component Library

### Problem
UI patterns (stat cards, table wrappers, page headers, section headers, empty states, badge variants) are duplicated across features with no shared abstraction.

### Component Inventory to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `<PageHeader>` | `components/ui/page-header.tsx` | Page title + description + optional action button |
| `<StatCard>` | `components/ui/stat-card.tsx` | Icon + label + value display; replaces ad-hoc stat cards everywhere |
| `<EmptyState>` | `components/ui/empty-state.tsx` | Icon + title + optional description + optional CTA |
| `<SectionHeader>` | `components/ui/section-header.tsx` | Section title + optional subtitle inside a card/panel |
| `<DataTable>` | `components/ui/data-table.tsx` | Wrapper adding pagination + horizontal scroll to any table |
| `<StatusBadge>` | `components/ui/status-badge.tsx` | Semantic badge (open/closed/pending) using theme colors |
| `<AmountDisplay>` | `components/ui/amount-display.tsx` | Signed currency with color (green positive / red negative), RTL-safe |

### Action Items
1. Create each component in `apps/web/src/components/ui/`.
2. Props must be fully typed with TypeScript; no `any`.
3. All display strings must be passed as props (no hardcoded Arabic inside shared components).
4. Replace duplicated patterns in feature files with the new components.
5. Export all from `apps/web/src/components/ui/index.ts`.

---

## Milestone 8 — Theme System: CSS Variable-Only Colors

### Problem
Some colors are hardcoded as Tailwind arbitrary values (e.g., `bg-[#1a1a2e]`, `text-green-400`) instead of referencing the CSS variable–based theme. This makes future retheming require a full search-and-replace.

### Current State
`styles.css` already defines a comprehensive oklch-based CSS variable system (light + dark mode). The issue is _usage_ in JSX.

### Rules to Enforce
- **Allowed:** `bg-background`, `text-foreground`, `bg-primary`, `text-primary`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-sidebar`, and all shadcn semantic tokens.
- **Not allowed:** Raw hex (`#fff`), named Tailwind colors (`green-400`, `red-500` for semantic meaning), or arbitrary values for theme colors.
- **Exception:** Chart colors (`chart-1` through `chart-5`) map to CSS variables and are fine.

### Action Items
1. Audit all `*.tsx` in `features/` for raw color values:
   ```bash
   grep -rn --include="*.tsx" "text-green-\|text-red-\|bg-green-\|bg-red-\|bg-\[#\|text-\[#" apps/web/src/features/
   ```
2. Replace semantic uses:
   - `text-green-*` for positive amounts → `text-emerald-600 dark:text-emerald-400` OR define `--color-positive` / `--color-negative` CSS variables and use `text-[--color-positive]`.
   - Better: add two new CSS variables to `styles.css`:
     ```css
     --color-positive: oklch(0.65 0.18 145);    /* green */
     --color-negative: oklch(0.61 0.21 24);      /* red-orange = destructive */
     ```
   - Then use `text-[var(--color-positive)]` or add Tailwind plugin aliases `text-positive` / `text-negative`.
3. Update `AmountDisplay` component (Milestone 7) to use these variables.
4. Remove all `text-green-*` and `text-red-*` from debt files.

---

## Milestone 9 — Debt Panel Pagination / Virtual Scroll

### Problem
The debt cases panel (left sidebar) and the ledger entries table grow unbounded with no scroll limit or pagination. With many cases or entries this becomes visually broken.

### Action Items

#### 9a — Cases Panel (left sidebar)
1. Wrap the cases list container with a fixed max height and `overflow-y-auto`:
   ```tsx
   <div className="max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
     {sortedAccounts.map(...)}
   </div>
   ```
2. Add a subtle scroll indicator (fade gradient at bottom) when list overflows.
3. If case count exceeds 20, add a simple "show more" or client-side pagination (10 per page).

#### 9b — Ledger Entries Table
1. Wrap the table in a scrollable container with fixed height:
   ```tsx
   <div className="max-h-96 overflow-y-auto">
     <table>...</table>
   </div>
   ```
2. Add client-side pagination using the `<DataTable>` component from Milestone 7:
   - Default page size: 10 entries
   - Show total entry count
   - Previous / Next buttons
3. Sort entries by `entryDate DESC` by default (already done in `sortDebtEntries`).

#### 9c — Debts Hub Table
1. The main hub page table (`debts-hub-page.tsx`) should also use `<DataTable>` with pagination (page size 15).
2. Add a search/filter bar above the table (filter by name or phone).

---

## Milestone 10 — Closure Log: Linked Case Label

### Problem
The closure log entry shows "أُغلق من هذه الحالة مقابل حالة مرتبطة" — the linked case's label is not shown because the API may not return it.

### Action Items
1. Inspect `apps/api/src/modules/debts/` to see what `DebtClosureLink` returns.
2. If the linked account's `note` is not included, update the repository query to join `debtAccount` on `linkedAccountId` and return `linkedAccount.note` alongside the closure link.
3. Update `packages/contracts/src/index.ts` to add `linkedAccountNote?: string` to the `DebtClosureLink` type.
4. In `debt-ledger-panel.tsx`, render the linked account note as the label in the closure log card.
5. Run `pnpm --filter @tuari/contracts build` after contract changes.

---

## Execution Order

| Priority | Milestone | Effort | Dependencies |
|----------|-----------|--------|--------------|
| 1 | M1 — i18n audit | Medium | None |
| 2 | M6 — 404 + route guards | Small | None |
| 3 | M8 — Theme CSS variables | Small | None |
| 4 | M5 — Sidebar spacing | Small | None |
| 5 | M7 — Modular components | Medium | M8 |
| 6 | M4 + M10 — Closure UI + API | Medium | M7 |
| 7 | M9 — Pagination/scroll | Medium | M7 |
| 8 | M3 — Tab-based UI | Large | M7 |
| 9 | M2 — Employee role filter | Small | M1 |

---

## Definition of Done

- [ ] `grep -r '[ء-ي]' apps/web/src/features/ --include="*.tsx" --include="*.ts"` returns zero results outside `i18n/` files
- [ ] `/roles` route is inaccessible to normal navigation
- [ ] A path like `/nonexistent` renders the 404 page
- [ ] No raw hex or named Tailwind colors used for semantic meaning in feature files
- [ ] All shared UI patterns (stat cards, empty states, page headers) use components from `components/ui/`
- [ ] Debt detail pages use tabs — no more than 2 major sections visible simultaneously
- [ ] Closure log shows the linked case label
- [ ] Cases list and ledger table are paginated or height-capped with scroll
- [ ] `pnpm lint` and `pnpm typecheck` pass clean
- [ ] `pnpm test` passes
