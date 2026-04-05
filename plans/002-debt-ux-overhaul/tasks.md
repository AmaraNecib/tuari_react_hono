# 002 - Tasks: Debt UX Overhaul

> Implementation order matters. Each phase unblocks the next.
> All UI uses Tailwind + shadcn/ui components. All new text needs Arabic + English i18n keys.
> All layout uses RTL-safe logical properties (ps/pe/ms/me, not pl/pr/ml/mr).

---

## Phase 1 — Overscroll Fix (F7)

### T1.1 — Add `overscroll-contain` to main scroll container
**File:** `apps/web/src/features/app-shell/home-view-signed-in-shell.tsx`

Change line 86:
```tsx
// before
<main className="h-screen overflow-y-auto" style={{ paddingRight: sidebarWidth }}>

// after  (add overscroll-contain)
<main className="h-screen overflow-y-auto overscroll-contain" style={{ paddingRight: sidebarWidth }}>
```

### T1.2 — Fix background bleed in `styles.css`
**File:** `apps/web/src/styles.css`

After the `:root { ... }` block, ensure `html` has a matching background-color so overscroll reveal blends in:
```css
html {
  background-color: oklch(0.972 0.011 95);   /* matches light --background */
}

.dark html,
html.dark {
  background-color: oklch(0.09 0.018 255);   /* matches dark --app-background base */
}
```
Also add to the `body` rule:
```css
body {
  overscroll-behavior: none;   /* belt-and-suspenders */
}
```

### T1.3 — Tauri window background color
**File:** `apps/desktop/src-tauri/tauri.conf.json`

Find the `windows` array and add/update `backgroundColor`:
```json
"backgroundColor": "#090f17"
```
(This is the dark hex equivalent of `oklch(0.09 0.018 255)`. In light mode the default white is fine.)

---

## Phase 2 — External Persons Sidebar Section (F1)

### T2.1 — Add new page types to `WorkspaceSidebarPage`
**File:** `apps/web/src/features/app-shell/workspace-sidebar.tsx`

Add to the `WorkspaceSidebarPage` union (line ~25):
```typescript
| "external-persons"
| "external-person-create"
| "external-person-details"
```

### T2.2 — Add route targets to `WorkspaceRouteTarget`
**File:** `apps/web/src/router/navigation.tsx`

Add to the `WorkspaceRouteTarget` union:
```typescript
| { to: "/external-persons" }
| { to: "/external-persons/create"; search?: { redirect?: string } }
| { to: "/external-persons/$personId"; params: { personId: string } }
```

### T2.3 — Add `workspaceRoutes` helpers
**File:** `apps/web/src/router/navigation.tsx`

Add to the `workspaceRoutes` object:
```typescript
externalPersons: (): WorkspaceRouteTarget => ({ to: "/external-persons" }),
externalPersonCreate: (redirect?: string): WorkspaceRouteTarget => ({
  to: "/external-persons/create",
  ...(redirect ? { search: { redirect } } : {}),
}),
externalPersonDetails: (personId: string): WorkspaceRouteTarget => ({
  to: "/external-persons/$personId",
  params: { personId },
}),
```

### T2.4 — Register new routes in TanStack Router
**File:** `apps/web/src/router.tsx`

Add route definitions alongside existing ones:
```typescript
const externalPersonsRoute = createWorkspaceRoute("/external-persons", "external-persons")
const externalPersonCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/external-persons/create",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: ExternalPersonCreateRouteComponent,
})
const externalPersonDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/external-persons/$personId",
  component: ExternalPersonDetailsRouteComponent,
})
```

Add route components:
```typescript
function ExternalPersonCreateRouteComponent() {
  const search = externalPersonCreateRoute.useSearch()
  return <HomeView page="external-person-create" redirectAfterCreate={search.redirect} />
}

function ExternalPersonDetailsRouteComponent() {
  const { personId } = externalPersonDetailsRoute.useParams()
  return <HomeView counterpartyId={personId} page="external-person-details" />
}
```

Add to `routeTree.addChildren([...])`.

### T2.5 — Add sidebar nav item
**File:** `apps/web/src/features/app-shell/workspace-sidebar.tsx`

1. Import `Contact` icon from lucide-react (or `PersonStanding` / `UsersRound`).
2. Add to the `items` array after `employees`:
   ```typescript
   { key: "external-persons", target: workspaceRoutes.externalPersons(), icon: Contact },
   ```
3. Add `externalPersonsLabel` to `WorkspaceSidebarProps` and `itemLabels`.
4. Update `activeKey` logic:
   ```typescript
   currentPage === "external-person-create" || currentPage === "external-person-details"
     ? "external-persons"
     : ...
   ```

### T2.6 — Add navigation helpers
**File:** `apps/web/src/features/app-shell/home-view-navigation.ts`

Add:
```typescript
goToExternalPersons: () => goToRoute(workspaceRoutes.externalPersons()),
goToExternalPersonCreate: (redirect?: string) => goToRoute(workspaceRoutes.externalPersonCreate(redirect)),
goToExternalPersonDetails: (personId: string) => goToRoute(workspaceRoutes.externalPersonDetails(personId)),
```

### T2.7 — Add copy keys
**File:** `apps/web/src/features/app-shell/home-view-copy.tsx` (and i18n JSON files)

Add section key: `externalPersons: { label: string }` to the sections copy builder.

**Files:** `apps/web/src/i18n/ar.json`, `apps/web/src/i18n/en.json`
```json
// ar
"sections.externalPersons.label": "الأطراف الخارجية"

// en
"sections.externalPersons.label": "External Persons"
```

### T2.8 — Wire new pages in shell + breadcrumbs
**File:** `apps/web/src/features/app-shell/home-view.tsx`

Add `redirectAfterCreate` prop to `HomeView` function signature.

**File:** `apps/web/src/features/app-shell/home-view-page-content-sections.tsx` (or detail pages file)

Add cases for `"external-persons"`, `"external-person-create"`, `"external-person-details"` pages.
Reuse (or move) existing `ExternalCounterpartiesPage`, `ExternalCounterpartyCreatePage`, `ExternalCounterpartyDetailsPage` components for these new routes, keeping old `/debts/counterparties/*` routes as redirects or just removing them if nothing else links there.

**File:** `apps/web/src/features/app-shell/workspace-breadcrumbs.tsx`

Add breadcrumb entries for the three new pages.

---

## Phase 3 — Debt Creation Flow (F2)

### T3.1 — Add `debt-create` page type
**File:** `apps/web/src/features/app-shell/workspace-sidebar.tsx`

Add `"debt-create"` to `WorkspaceSidebarPage` union.
Update `activeKey` to map `"debt-create"` → `"debts"`.

### T3.2 — Add `/debts/create` route
**File:** `apps/web/src/router.tsx`

```typescript
const debtCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/debts/create",
  validateSearch: (search: Record<string, unknown>) => ({
    partyType: typeof search.partyType === "string" ? search.partyType : undefined,
    externalCounterpartyId: typeof search.externalCounterpartyId === "string" ? search.externalCounterpartyId : undefined,
    workerId: typeof search.workerId === "string" ? search.workerId : undefined,
  }),
  component: DebtCreateRouteComponent,
})

function DebtCreateRouteComponent() {
  const search = debtCreateRoute.useSearch()
  return (
    <HomeView
      page="debt-create"
      preselectedPartyType={search.partyType}
      preselectedExternalCounterpartyId={search.externalCounterpartyId}
      preselectedWorkerId={search.workerId}
    />
  )
}
```

Add to `routeTree.addChildren([...])`.

### T3.3 — Create `debt-create-page.tsx`
**File:** `apps/web/src/features/debts/debt-create-page.tsx` *(new file)*

Multi-step form component:

**Step 1 — Party type toggle:**
- Two large radio/toggle cards: "موظف داخلي" (Internal Employee) and "طرف خارجي" (External Person)
- Use shadcn `RadioGroup` styled as card buttons (rounded-[22px], border, active state with `border-primary/35 bg-primary/8`)

**Step 2 — Party selection:**
- If internal: `<Combobox>` of employees (query `employeesList` via existing mock-dashboard hook)
- If external: `<Combobox>` of external counterparties + a `<Button variant="ghost" size="icon">` with `Plus` icon that calls `navigation.goToExternalPersonCreate("debt-create")`

**Step 3 — Amount & direction:**
- Direction toggle: two buttons "لنا عنده" (positive) / "علينا له" (negative)
- `<CurrencyInput>` for the absolute amount (always positive input)
- The sign is determined by the toggle, applied before calling the API

**Step 4 — Note (optional):**
- `<Textarea>` for case label

**Submit:**
- Calls `createDebtAccountMutation.mutateAsync(...)`
- On success → navigate to the new debt case: `navigation.goToExternalPersonDetails(counterpartyId)` or `navigation.goToEmployeeDetails(employeeId)` with `?tab=debts`

**Preselection support:**
- Accept `preselectedPartyType`, `preselectedExternalCounterpartyId`, `preselectedWorkerId` props
- If these are present, skip directly to step 3 (amount entry)

### T3.4 — Add redirect-back to external-person-create page
**File:** `apps/web/src/features/debts/external-counterparty-create-page.tsx`

Accept `redirectAfterCreate?: string` prop.
On successful creation, if `redirectAfterCreate === "debt-create"`:
```typescript
navigation.goToRoute({
  to: "/debts/create",
  search: {
    partyType: "EXTERNAL_COUNTERPARTY",
    externalCounterpartyId: result.item.id,
  },
})
```

### T3.5 — Add route target for debt create
**File:** `apps/web/src/router/navigation.tsx`

Add to `WorkspaceRouteTarget` union:
```typescript
| {
    to: "/debts/create"
    search?: {
      partyType?: string
      externalCounterpartyId?: string
      workerId?: string
    }
  }
```

Add to `workspaceRoutes`:
```typescript
debtCreate: (search?: { partyType?: string; externalCounterpartyId?: string; workerId?: string }): WorkspaceRouteTarget => ({
  to: "/debts/create",
  ...(search ? { search } : {}),
}),
```

### T3.6 — Add "New Debt" button to debts hub
**File:** `apps/web/src/features/debts/debts-hub-page.tsx`

Replace the current `onCreateExternalCounterparty` button with two buttons:
```tsx
<div className="flex flex-wrap gap-3">
  <Button onClick={onCreateDebt}>
    <Plus className="me-2 size-4" />
    دين جديد
  </Button>
  <Button variant="outline" onClick={onManageExternalPersons}>
    <Contact className="me-2 size-4" />
    الأطراف الخارجية
  </Button>
</div>
```

Update props: remove `onCreateExternalCounterparty`, add `onCreateDebt`, `onManageExternalPersons`.

---

## Phase 4 — Per-Person Debt View (F3)

### T4.1 — Add `DebtPartySummaryCard` component
**File:** `apps/web/src/features/debts/debt-party-summary-card.tsx` *(new file)*

Displays net balance across all debt accounts for a person:
```tsx
// Props
{
  accounts: DebtAccount[]
  personName: string
}

// UI
// - Large net balance number with color coding
// - "لنا عنده X دج / علينا له X دج" split view if both sides exist
// - Sub-text: "{openCount} حالات مفتوحة، {settledCount} مغلقة"
// - Badge: net direction label
```

Use the existing `getCombinedDebtBalance()` and `getDebtBalanceMeta()` from `debt-utils.ts`.

### T4.2 — Add "Debts" tab to employee details
**File:** `apps/web/src/features/app-shell/home-view-page-content-detail-pages.tsx` (find the employee details section)

1. Find where employee detail tabs are rendered (look for `tab === "finance"` or `tab === "salary"` or similar).
2. Add `tab === "debts"` case that renders `<DebtCasesPanel>` with the employee's debt data.
3. Add the tab button itself to the tab bar (after "salary" tab):
   ```tsx
   <TabButton tab="debts" label={t("debt.tab")} icon={HandCoins} />
   ```

Data source: The workspace data already has employees with `debtAccounts` included (via `debtPartyDetail` endpoint wired in `mock-dashboard.ts`). Check if it's already loaded or add the query.

### T4.3 — Improve external-counterparty-details-page layout
**File:** `apps/web/src/features/debts/external-counterparty-details-page.tsx`

Current layout: shows `DebtCasesPanel` directly.

Target layout:
```
[Person header card: name, phone, note, edit button]
[DebtPartySummaryCard: net balance across all debts]
[DebtCasesPanel: list of individual cases + selected ledger]
```

Add person header using `Surface variant="card"` with the counterparty's info.

---

## Phase 5 — Payment Dialog (F4)

### T5.1 — Create `RecordPaymentDialog` component
**File:** `apps/web/src/features/debts/record-payment-dialog.tsx` *(new file)*

```tsx
// Props
{
  open: boolean
  debtAccount: DebtAccount
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}
```

**Dialog layout (use shadcn `Dialog` + `DialogContent`):**
```
[Header]  "تسجيل دفعة" / record payment
[Balance display]
  Current: "الرصيد الحالي: دج 3,000" (color-coded)
  Direction text: "لنا عنده" or "علينا له"

[Amount section]
  Label: "المبلغ المدفوع"
  <CurrencyInput> — always positive
  <Button variant="ghost" size="sm"> "دفع كامل المبلغ" — fills input with abs(balance)

[Note field]
  <Textarea placeholder="مثال: نقدي، تحويل بنكي" />

[Date field]
  <input type="date" />

[Footer]
  <Button variant="outline" onClick={onClose}>إلغاء</Button>
  <Button disabled={!valid || isPending} onClick={handleSubmit}>تأكيد الدفعة</Button>
```

**Sign logic:**
- Balance positive (they owe us) → payment reduces their debt → `signedAmountDzd = -amount`
- Balance negative (we owe them) → payment by us → `signedAmountDzd = +amount`
- Calls `createDebtEntryMutation.mutate({ entryType: "PAYMENT", signedAmountDzd, ... })`

**Post-payment:**
- If `balanceAfterDzd === 0`: show inline success state with "هل تريد تسوية الحالة؟" prompt + "تسوية" button calling `settleDebtAccountMutation`.
- Otherwise: close dialog and invalidate query cache.

### T5.2 — Wire `RecordPaymentDialog` into `DebtCasesPanel`
**File:** `apps/web/src/features/debts/debt-cases-panel.tsx`

In the account card (the `<button>` rendering each account), add a "سجّل دفعة" button below the balance line:
```tsx
<Button
  size="sm"
  variant="outline"
  className="mt-2 w-full"
  disabled={account.status === "SETTLED" || account.currentBalanceDzd === 0}
  onClick={(e) => {
    e.stopPropagation()  // don't trigger card selection
    setPaymentTargetAccountId(account.id)
  }}
>
  سجّل دفعة
</Button>
```

Add `paymentTargetAccountId` state and render:
```tsx
{paymentTargetAccount && (
  <RecordPaymentDialog
    open={Boolean(paymentTargetAccount)}
    debtAccount={paymentTargetAccount}
    onOpenChange={(open) => !open && setPaymentTargetAccountId(null)}
  />
)}
```

---

## Phase 6 — Debts Hub Improvements (F6)

### T6.1 — Filter tabs on debts hub
**File:** `apps/web/src/features/debts/debts-hub-page.tsx`

Add filter state: `"all" | "owed-to-us" | "owed-by-us" | "settled"`

Render tab-pill row above the table:
```tsx
<div className="flex gap-2 flex-wrap">
  {["all", "owed-to-us", "owed-by-us", "settled"].map((f) => (
    <button
      key={f}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm transition-colors",
        activeFilter === f
          ? "border-primary/30 bg-primary/10 text-primary font-medium"
          : "border-border/60 text-muted-foreground hover:bg-muted/40"
      )}
      onClick={() => setActiveFilter(f)}
    >
      {filterLabel[f]}
    </button>
  ))}
</div>
```

Filter `rows` based on `activeFilter`:
- `owed-to-us`: `row.balanceDzd > 0`
- `owed-by-us`: `row.balanceDzd < 0`
- `settled`: `row.status === "SETTLED"`

### T6.2 — Clickable table rows
**File:** `apps/web/src/features/debts/debts-hub-page.tsx`

Change `<tr>` to be clickable:
```tsx
<tr
  key={row.accountId}
  className="... cursor-pointer hover:bg-muted/30"
  onClick={() => row.type === "worker"
    ? onOpenWorker(row.partyId)
    : onOpenExternalPerson(row.partyId)
  }
>
```

Remove the separate "فتح التفاصيل" action column (the whole row is now clickable).

### T6.3 — Add open debt count column
**File:** `apps/web/src/features/debts/debts-hub-page.tsx`

The `rows` prop currently has `caseCount`. Request the hub data to also include `openCaseCount`.
Add column header "مفتوحة" and show `row.openCaseCount` next to `row.caseCount`:
```tsx
<td>{row.openCaseCount} / {row.caseCount}</td>
```

This may require updating the data transformation in the home-view controller that builds the `rows` array.

---

## Phase 7 — Polish & i18n Completion

### T7.1 — Complete Arabic i18n keys
All new Arabic strings used in components must have a matching key in `apps/web/src/i18n/ar.json`.
All labels must also exist in `apps/web/src/i18n/en.json`.

Key list:
```
debt.tab                          → "الديون" / "Debts"
debt.newDebt                      → "دين جديد" / "New Debt"
debt.createTitle                  → "إنشاء حالة دين جديدة" / "Create New Debt"
debt.partyType.internal           → "موظف داخلي" / "Internal Employee"
debt.partyType.external           → "طرف خارجي" / "External Person"
debt.direction.owedToUs           → "لنا عنده" / "They owe us"
debt.direction.owedByUs           → "علينا له" / "We owe them"
debt.payment.title                → "تسجيل دفعة" / "Record Payment"
debt.payment.currentBalance       → "الرصيد الحالي" / "Current Balance"
debt.payment.amount               → "المبلغ المدفوع" / "Payment Amount"
debt.payment.payFull              → "دفع كامل المبلغ" / "Pay Full Amount"
debt.payment.confirm              → "تأكيد الدفعة" / "Confirm Payment"
debt.payment.settlePrompt         → "هل تريد تسوية الحالة الآن؟" / "Settle case now?"
debt.filter.all                   → "الكل" / "All"
debt.filter.owedToUs              → "لنا عنده" / "Owed to us"
debt.filter.owedByUs              → "علينا له" / "Owed by us"
debt.filter.settled               → "مغلقة" / "Settled"
sections.externalPersons.label    → "الأطراف الخارجية" / "External Persons"
externalPerson.createTitle        → "إضافة طرف خارجي" / "Add External Person"
externalPerson.backToDebtCreate   → "العودة لإنشاء الدين" / "Back to debt creation"
```

### T7.2 — Ensure RTL correctness on all new components
Review every new component for:
- All flex rows: use `gap-*` (not margin) or `me-*`/`ms-*` instead of `mr-*`/`ml-*`
- Icons before text: icon uses `me-2` (not `mr-2`)
- Table: use `text-start` (not `text-left`)
- No absolute left/right positioning — use `inset-inline-start/end` or Tailwind logical equivalents

### T7.3 — Accessibility pass on new dialogs and forms
- All dialogs must trap focus (shadcn `Dialog` does this automatically)
- Payment dialog `<CurrencyInput>` must have a visible `<label>` (not just placeholder)
- Debt creation step buttons must have `aria-pressed` state
- Comboboxes use the existing shadcn `Combobox` component which handles keyboard nav

---

## Reference: Files Modified Per Feature

| Feature | Files Changed |
|---------|---------------|
| F7 overscroll | `home-view-signed-in-shell.tsx`, `styles.css`, `tauri.conf.json` |
| F1 external persons sidebar | `workspace-sidebar.tsx`, `router/navigation.tsx`, `router.tsx`, `home-view-navigation.ts`, `home-view-copy.tsx`, `workspace-breadcrumbs.tsx`, i18n JSONs |
| F2 debt creation flow | `router.tsx`, `router/navigation.tsx`, `debts/debt-create-page.tsx` (new), `external-counterparty-create-page.tsx`, `debts-hub-page.tsx` |
| F3 per-person debt view | `debt-party-summary-card.tsx` (new), `home-view-page-content-detail-pages.tsx`, `external-counterparty-details-page.tsx` |
| F4 payment dialog | `record-payment-dialog.tsx` (new), `debt-cases-panel.tsx` |
| F5 consolidation | Already in `debt-ledger-panel.tsx` — the "إغلاق مقابل حالة أخرى" panel exists. UX improvements are optional polish. |
| F6 hub improvements | `debts-hub-page.tsx` |
| i18n + polish | `i18n/ar.json`, `i18n/en.json`, all new components |

---

## Notes for Implementor

- **No new backend endpoints needed.** All mutations exist: `debtAccountsCreate`, `debtEntriesCreate`, `debtCloseAgainst`, `debtAccountsSettle`, `externalCounterpartiesCreate`.
- **F5 (debt consolidation)** is already partially implemented in `DebtLedgerPanel` via the "إغلاق مقابل حالة أخرى" section. The task is to improve its discoverability and UX, not rebuild it.
- **`mock-dashboard.ts`** is the query/mutation bridge layer — any new queries must be added there alongside the existing ones.
- **`home-view-derived.ts`** transforms raw workspace data into page-ready view models — new data shapes for the debt create page may need entries there.
- **Payment sign rule:** When balance > 0 (they owe us), a payment from them reduces their debt → entry is negative (`signedAmountDzd = -paymentAmount`). When balance < 0 (we owe them), a payment from us reduces our debt → entry is positive (`signedAmountDzd = +paymentAmount`). This matches the existing ledger panel's "موجب لنا، سالب علينا" convention.
