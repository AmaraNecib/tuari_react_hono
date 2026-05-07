# TauriOS Redesign — Task Tracker
> Start each session by reading REDESIGN_SPEC.md first.
> Mark tasks [x] as completed. Add notes under tasks as needed.

---

## Phase 1 — Design System Foundation
> Touch `apps/web/src/styles.css` and `apps/web/index.html`

- [x] **1.1** Add font imports to `index.html`: Instrument Serif, IBM Plex Sans Arabic, Noto Naskh Arabic, Amiri, JetBrains Mono, Inter Tight
- [x] **1.2** Replace `styles.css` color tokens with warm paper palette
  - All shadcn variables remapped to new warm palette
  - TauriOS tokens (`--bg`, `--ink`, `--line`, etc.) mapped through `@theme inline` → Tailwind utilities
- [x] **1.3** Approach changed: use Tailwind utilities instead of custom CSS classes
  - `.stat-band`, `.stat`, `.stat-label`, `.stat-val`, `.stat-meta`, `.delta`
  - `.section`, `.section-h`, `.section-title`, `.section-actions`, `.section-link`
  - `.tbl` overrides (flat, mono headers, row-h)
  - `.tag` variants (good/warn/bad/accent)
  - `.feed`, `.feed-item`, `.feed-time`, `.feed-text`
  - `.proj-row`, `.proj-name`, `.proj-budget`
  - `.item-row`, `.item-thumb`
  - `.qa`, `.actions-grid`
  - `.page-h`, `.page-eyebrow`, `.page-title`, `.page-sub`
  - `.kv-grid`, `.kv`
  - `.ledger-head`, `.ledger-h`, `.ledger-v`
  - `.split`, `.aside`, `.aside-block`, `.aside-h`, `.aside-row`
  - `.tabs` + `.tab` overrides
  - `.chip` filter pills
  - `.money`, `.bar`, `.slot`, `.spark`
  - `.btn`, `.btn-primary`, `.btn-accent`, `.btn-ghost`, `.btn-sm`
  - `.icon-btn`, `.search`, `.kbd`, `.crumbs`
- [x] **1.4** RTL overrides via Tailwind logical properties (`border-s`, `ms-auto`, `ps-*`, `pe-*`, `text-start`)
- [x] **1.5** Arabic font overrides in `@layer base` — IBM Plex Sans Arabic body, Amiri headings
- [x] **1.6** Density CSS variables (`[data-density="compact/regular/comfy"]`) in styles.css
- [ ] **1.7** Test: verify warm background, sidebar colors, Arabic fonts — needs running dev server

---

## Phase 2 — Shell Redesign
> Touch `apps/web/src/features/app-shell/`

- [x] **2.1** Redesign sidebar (`workspace-sidebar.tsx`):
  - Brand mark: 22×22 ink box with "T", italic serif name
  - Org block with avatar + name + chevron
  - Nav groups with mono uppercase labels
  - Active item: surface bg + left/right 2px accent bar (RTL: right)
  - Count badges aligned to far edge
  - Footer: gradient avatar + user name + role
  - Collapsible: text fades, icons stay, sidebar shrinks to 56px
- [ ] **2.2** Redesign topbar (partial — layout done, still missing: sidebar toggle btn, search input, bell icon, New btn):
  - Sidebar toggle → breadcrumbs → spacer → search (280px, 30px tall) → theme toggle → bell → New btn
  - New btn: accent (terracotta) style
- [x] **2.3** Update shell grid layout (`home-view-signed-in-shell.tsx`):
  - `grid-template-columns: var(--sidebar-w, 232px) 1fr`
  - Collapsed state: `56px 1fr`
  - Content padding: 40px / 48px (density-aware)
- [ ] **2.4** Update breadcrumb separator: `›` (chevron icon, flipped in RTL)
- [ ] **2.5** Test: sidebar collapses/expands, RTL sidebar border is on left, active item accent bar is on right

---

## Phase 3 — Shared Page Primitives
> Touch `apps/web/src/features/shared/page-primitives.tsx` and related

- [ ] **3.1** Update `PageHeader` component:
  - Eyebrow: mono uppercase 10.5px
  - Title: display/serif font, 48px, italic (en) / normal Amiri (ar)
  - Sub: 15px muted
  - Actions slot: right-aligned flex row
- [ ] **3.2** Create/update `StatBand` component (4-col KPI row with flat borders)
- [ ] **3.3** Create `SectionHeader` component (italic title + count + actions + link)
- [ ] **3.4** Update `Surface` / card primitives to match new tokens
- [ ] **3.5** Create `Tag` / `StatusTag` components with new mono style
- [ ] **3.6** Create `MoneyDisplay` component (tabular-nums, pos/neg coloring)
- [ ] **3.7** Create `ProgressBar` component (4px, ink fill, bad when over)

---

## Phase 4 — Missing/Incomplete Pages

### 4.1 Invoice Details Page
> File: `apps/web/src/features/inventory/inventory-invoice-details-page.tsx`
> Route: `/invoices/$invoiceId` — already wired in router

- [ ] **4.1.1** Read full file (it exists, line ~50+)
- [ ] **4.1.2** Apply new design: page-h + stat-band (amount/status/date/items count)
- [ ] **4.1.3** Add items table in new `.tbl` style
- [ ] **4.1.4** Add payment section (record payment button → inline dialog)
- [ ] **4.1.5** Verify invoice details loads when clicking invoice from list

### 4.2 Warehouse ↔ Project Transfer Dialog
> Currently: transfer mutations exist in inventory-hooks.ts but no UI entry point

- [x] **4.2.1** Create `<TransferItemDialog>` component in `apps/web/src/features/inventory/`
  - Fields: item (searchable select), from (warehouse/project), to (warehouse/project), quantity (consumables), note
  - Uses `useTransferInventoryAssetMutation` + `useTransferInventoryConsumableMutation`
- [x] **4.2.2** Add "Transfer" button to warehouse details page items table (per-row action)
  - Via updated `InventoryLocationContentsSection` — Transfer button on each asset and consumable row
- [x] **4.2.3** Add "Transfer" button to project details page items tab
  - Same section component used — gets button automatically
- [ ] **4.2.4** Test: transfer consumable from warehouse to project, verify stock changes

### 4.3 Salary Payment Dialog (UX Improvement)
> Currently: user navigates employee → salary tab → add payment → fill form → submit (3-4 steps)

- [x] **4.3.1** Create `<AddSalaryPaymentDialog>` in `apps/web/src/features/employees/`
  - Fields: amount, date (today default), note
  - On submit: calls `useCreateSalaryPaymentMutation`
  - Closes dialog → shows toast → done. No navigation.
- [x] **4.3.2** Add trigger button to employee table row (active workers only)
- [x] **4.3.3** Add trigger button to salary page (replaces navigate-to-finance flow)
- [x] **4.3.4** Add trigger to employee details header actions (active workers only)
- [ ] **4.3.5** Test: pay employee from list row in 1 click + confirm, no page navigation

---

## Phase 5 — Page Redesigns

### 5.1 Dashboard
- [ ] Apply new stat-band (active projects / spent / receivable / payable)
- [ ] Two-col layout: main + 360px right sidebar
- [ ] Projects-in-flight table with proj-row style
- [ ] Quick actions grid (4×2)
- [ ] Recent expenses table
- [ ] Activity feed + stock alerts in right column

### 5.2 Projects List
- [ ] Tab bar (All / Active / At risk / Paused / Complete) with counts
- [ ] Site filter chips row
- [ ] proj-row layout with budget progress bar + crew avatars

### 5.3 Project Details
- [ ] Stat band: status / progress / budget / due
- [ ] split layout: main + 320px aside
- [ ] Expenses, assets, crew tables in main
- [ ] Aside: client info / schedule / documents / photos

### 5.4 Warehouse Page
- [ ] Stat band: SKU count / value / low stock / assigned
- [ ] Tabs: All / Consumables / In-Use / Low stock
- [ ] item-row list with thumbnail
- [ ] Assigned assets table

### 5.5 Employees Page
- [ ] Stat band: headcount / payroll / advances / tenure
- [ ] Table with salary payment quick-action per row

### 5.6 Invoices Page
- [ ] Ledger head: receivable / payable / net (3-col flat)
- [ ] Two sections: outbound invoices + inbound bills

### 5.7 Analytics Page (NEW)
- [ ] Create new analytics route/page
- [ ] Stat band + SVG revenue/cost line chart
- [ ] Project spend breakdown (stacked bar + table + category breakdown)

---

## Phase 6 — Polish & RTL Testing

- [ ] **6.1** Full RTL audit: every page in Arabic direction
- [ ] **6.2** Active sidebar indicator on right side in RTL
- [ ] **6.3** Table headers right-aligned in RTL, numeric columns left-aligned
- [ ] **6.4** Breadcrumb separator flips in RTL
- [ ] **6.5** Avatar stacks overlap correct direction in RTL
- [ ] **6.6** Dark mode: verify all tokens switch correctly
- [ ] **6.7** i18n: all new strings added to both `en` and `ar` in translation files

---

## Notes & Decisions

### Tailwind v4 mapping strategy
The app uses Tailwind v4 with `@theme inline`. New tokens go in `styles.css` as CSS variables.
Don't rename shadcn tokens — add NEW tokens alongside existing ones:
```css
:root {
  /* New TauriOS tokens */
  --tauri-bg: #f6f3ee;
  --tauri-accent: #b4502a;
  /* etc. */
}
```
Or override the shadcn values directly (cleaner, less duplication).

### Existing font
`@fontsource-variable/noto-sans-arabic` is already installed.
Need to add via `<link>` in index.html or install packages:
- `@fontsource/instrument-serif`
- `@fontsource/ibm-plex-sans-arabic` (or use Google Fonts link)
- `@fontsource/jetbrains-mono`

### RTL — already configured
The app has i18next with Arabic locale and sets `dir="rtl"` on html.
Preferences system (`apps/web/src/features/preferences/`) handles locale.

### Salary mutations
Located in: `apps/web/src/hooks/use-report-queries.ts` or company workforce module.
Check: RPC handler at `apps/api/src/rpc/handlers/workforce.ts`

### Transfer mutations
Located in: `apps/web/src/features/inventory/inventory-hooks.ts`
- `useTransferInventoryAssetMutation`
- `useTransferInventoryConsumableMutation`
Already implemented — just need the UI dialog.
