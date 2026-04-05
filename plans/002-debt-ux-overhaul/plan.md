# 002 - Debt UX Overhaul & Multi-Debt Workflow

## Overview

Improve the debt management experience: better multi-debt visibility per person, inline payment processing, debt consolidation (closing debts against each other), a dedicated external-persons section in the sidebar, an improved debt-creation flow with redirect-back support, debt tabs on employee/counterparty detail pages, and a fix for the overscroll background bleed in dark mode.

---

## Features

### F1. External Persons as a Sidebar Section

**Current state:** External counterparties are nested under `/debts/counterparties`. There is no top-level sidebar entry for managing external people independently.

**Target:**
- Add a new sidebar item **"External Persons"** (or Arabic equivalent) with its own icon, linking to `/external-persons`.
- The page lists all external counterparties with search/filter.
- Each row links to a detail page showing the person's info and their debt summary.
- Create button on the list page.

**Files to change:**
- `apps/web/src/features/app-shell/workspace-sidebar.tsx` - add nav item
- `apps/web/src/router.tsx` - add `/external-persons`, `/external-persons/create`, `/external-persons/$id` routes
- Create new page components or refactor existing `external-counterparties-page.tsx` and `external-counterparty-details-page.tsx` to live under the new route
- Update breadcrumb mappings in `workspace-breadcrumbs.tsx`
- Add i18n keys for the new section

---

### F2. Improved Debt Creation Flow

**Current state:** The debts hub page shows a summary table. Creating a debt goes to a form, but the flow for selecting internal vs. external party and the redirect-back after creating an external person is not implemented.

**Target flow:**
1. User clicks **"New Debt"** button on the debts hub page (or from a person's debt tab).
2. **Step 1 - Party type:** Choose "Internal (Employee)" or "External Person".
3. **Step 2 - Party selection:**
   - If **Internal**: dropdown/combobox of existing employees.
   - If **External**: dropdown/combobox of existing external persons, **plus a "+" button** next to it.
4. **"+" button behavior:** Navigates to `/external-persons/create?redirect=debt-create` (or similar). After successful creation, redirects back to the debt creation page with the newly created person pre-selected and "External" pre-chosen.
5. **Step 3 - Amount & direction:**
   - A single numeric input. Positive = "they owe us" (we lent them money), Negative = "we owe them" (we borrowed). Or use a toggle/radio: "They owe us" / "We owe them" + a positive amount field. (Toggle approach is clearer for non-technical users.)
6. **Step 4 - Note** (optional): free-text label for the debt case.
7. Submit calls `debtAccountsCreate` with an opening entry.

**Files to change:**
- Create `apps/web/src/features/debts/debt-create-page.tsx` (or refactor existing)
- `apps/web/src/router.tsx` - ensure `/debts/create` route with query params support
- `apps/web/src/features/debts/external-counterparty-create-page.tsx` - add `redirect` query param handling; on success, navigate back with the new ID
- Add i18n keys for all new labels

---

### F3. Per-Person Debt View (Detail Page with All Debts)

**Current state:** `external-counterparty-details-page.tsx` shows debt cases for a counterparty. Employee detail pages have tabs but no debt tab.

**Target:**
- **Employee detail page** (`/employees/$employeeId`): Add a **"Debts"** tab alongside existing tabs (info, salary, etc.). This tab shows all debt accounts for that employee using the `debtPartyDetail` endpoint.
- **External person detail page** (`/external-persons/$id`): Same layout - person info at top, then a debt cases panel below.
- Each debt case card shows:
  - Status badge (Open / Settled)
  - Case label/note
  - Current balance with color coding (green = they owe us, red = we owe them)
  - "View Ledger" to expand/navigate to the entry history
  - "Record Payment" quick action button
  - "Settle" button (if balance is zero or to force-settle)

**Net balance summary at the top of the person's debt view:**
- Sum all open debt accounts: e.g., "Net: they owe you 1,000 DZD" (across all debts).
- Breakdown: "2 open debts, 1 settled".

**Files to change:**
- `apps/web/src/features/employees/employee-details-page.tsx` - add Debts tab
- `apps/web/src/features/debts/debt-cases-panel.tsx` - reuse/enhance for both employee and counterparty views
- `apps/web/src/features/debts/debt-party-summary-card.tsx` (new) - net balance summary component
- Add i18n keys

---

### F4. Payment Processing Within a Debt

**Current state:** `debtEntriesCreate` endpoint exists for PAYMENT entries. The UI has a ledger panel but no clear "make payment" flow.

**Target:**
- On a debt case's detail/ledger view, add a **"Record Payment"** button.
- Opens a dialog/sheet with:
  - Current balance displayed prominently
  - Amount input (with validation: cannot exceed remaining balance for full payoff, or any partial amount)
  - "Pay Full Amount" quick-fill button
  - Note field (optional, e.g., "Cash payment", "Bank transfer ref #123")
  - Submit button
- On submit: calls `debtEntriesCreate` with `entryType: "PAYMENT"` and `signedAmountDzd` (negative if reducing what they owe, positive if reducing what we owe - opposite sign of the balance).
- After payment, refresh the ledger and balance display.
- If balance reaches zero after payment, prompt to settle or leave open.

**Files to change:**
- Create `apps/web/src/features/debts/record-payment-dialog.tsx`
- `apps/web/src/features/debts/debt-ledger-panel.tsx` - add payment button, refresh on mutation
- Add i18n keys

---

### F5. Debt Consolidation (Close Debts Against Each Other)

**Current state:** `debtCloseAgainst` endpoint exists. No UI for it.

**Target:**
- On the per-person debt view (when a person has 2+ open debts with opposite signs), show a **"Consolidate Debts"** action.
- Flow:
  1. User selects 2 or more open debts to consolidate.
  2. System shows a preview: "Debt A: +3,000 DZD, Debt B: -2,000 DZD. After consolidation: Debt A: +1,000 DZD (open), Debt B: 0 DZD (settled)."
  3. User confirms with an optional note.
  4. System calls `debtCloseAgainst` for each pair, creating CLOSURE entries in both ledgers and a `DebtClosureLink` record.
  5. Debts that reach zero balance are marked as SETTLED.
- Also support consolidating debts across the same person (e.g., close 3 debts into one net result).

**Files to change:**
- Create `apps/web/src/features/debts/consolidate-debts-dialog.tsx`
- `apps/web/src/features/debts/debt-cases-panel.tsx` - add consolidate button (visible when 2+ open debts exist)
- May need a new backend helper if multi-debt consolidation requires a transaction wrapper
- Add i18n keys

---

### F6. Debts Hub Page Improvements

**Current state:** The debts hub shows a summary table of all parties with debts.

**Target enhancements:**
- **Two action buttons** at the top:
  1. **"New Debt"** - navigates to the debt creation flow (F2)
  2. **"External Persons"** - quick link to the external persons list (or this is now in the sidebar per F1)
- **Table improvements:**
  - Clicking a row navigates to the person's detail page (employee or external person) with the debts tab active
  - Add a "# of open debts" column
  - Filter by: "All", "They owe us", "We owe them", "Settled"

**Files to change:**
- `apps/web/src/features/debts/debts-hub-page.tsx` - add filters, improve table, navigation

---

### F7. Overscroll Background Fix (Dark Mode)

**Current state:** When swiping/scrolling beyond content bounds (rubber-band effect on desktop), the area beyond the content shows white (or the raw body background). This is cosmetic but very noticeable in dark mode.

**Root cause:** The `<main>` element has `h-screen overflow-y-auto`. When the user overscrolls, the browser reveals the area outside the scroll container. The body has gradient backgrounds, but the overscroll area can show the base `background-color` which may not match.

**Fix:**
- Set `overscroll-behavior: none` on the `<main>` scroll container to prevent rubber-band/bounce effect entirely. This is the cleanest fix for a desktop app.
- As a fallback, also ensure `background-color` on both `<html>` and `<body>` matches the dark mode base color so any overscroll bleed blends in.
- For the Tauri window specifically, set the window background color in `tauri.conf.json` to match the dark theme base.

**Files to change:**
- `apps/web/src/styles.css` - add `overscroll-behavior: none` to main scroll container and/or body; ensure `html` background-color matches dark mode
- `apps/web/src/features/app-shell/home-view-signed-in-shell.tsx` - add `overscroll-behavior-y: none` class to the `<main>` element
- `apps/desktop/src-tauri/tauri.conf.json` - set window background color if supported

---

## Implementation Order

| Phase | Features | Rationale |
|-------|----------|-----------|
| **Phase 1** | F7 (overscroll fix) | Quick CSS fix, immediate visual improvement |
| **Phase 2** | F1 (external persons sidebar) | Structural change that other features depend on |
| **Phase 3** | F2 (debt creation flow) | Core workflow, depends on F1 routes |
| **Phase 4** | F3 (per-person debt view + tabs) | Shows the multi-debt model to users |
| **Phase 5** | F4 (payment processing) | Core action within a debt |
| **Phase 6** | F5 (debt consolidation) | Advanced feature, depends on F3/F4 being solid |
| **Phase 7** | F6 (hub improvements) | Polish, depends on all other features existing |

---

## Technical Notes

- **Redirect-back pattern (F2):** Use a `?redirect=` query param on the external person create page. On success, navigate to the URL stored in the param with the new entity ID appended (e.g., `/debts/create?externalCounterpartyId=<newId>&partyType=EXTERNAL_COUNTERPARTY`).
- **Reuse existing endpoints:** All backend endpoints needed for F1-F6 already exist (`debtAccountsCreate`, `debtEntriesCreate`, `debtCloseAgainst`, `debtPartyDetail`, `debtsSummary`, `externalCounterpartiesCreate`). No new API routes required for the MVP of these features.
- **i18n:** All new UI text must have Arabic and English keys. Debt direction labels: "لنا عنده" (they owe us), "علينا له" (we owe them).
- **RTL:** All new components must work in RTL layout. Use logical properties (`ps`, `pe`, `ms`, `me`) instead of `pl`, `pr`, `ml`, `mr`.
- **Audit trail:** All mutations already capture `actorUserId`, `actorLabel`, `transactionId`. Frontend must continue passing these.

---

## Open Questions

1. **Amount sign convention:** Should the debt creation form use a toggle ("They owe us" / "We owe them") + positive amount, or a single signed input (positive/negative)? Toggle is more user-friendly.
2. **Multi-debt consolidation:** Should consolidation always reduce to a single remaining debt, or can the user choose which debts to close against which? Start simple: auto-consolidate all selected debts in order.
3. **External persons route:** Keep under `/debts/counterparties` or move to a top-level `/external-persons`? Moving to top-level is cleaner since external persons may be used beyond debts in the future.
4. **Employee debt tab position:** Where in the employee detail tabs should "Debts" appear? After salary seems logical.
