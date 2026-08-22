# Issue #25 — Invoice create form progressive disclosure

- Mode: pipeline lane (remote available; parent owns push/PR/merge)
- Ticket: #25 "UX: Invoice create form is overwhelming — use progressive disclosure"
- Source: parent crew brief (base = `origin/develop` @ fbb7d02)
- Target ref: `fix/issue-25-invoice-disclosure`
- Base SHA: `fbb7d02` (merge-base of the branch and `develop`)
- Review tier: Standard (Guard Phases 1+2, code-review, test-audit, Greptile CLI)

## Problem

`apps/web/src/features/inventory/inventory-invoice-create-page.tsx` (`/invoices/create`)
renders 10+ header fields at once (number, date, is-debt, counterparty, supplier,
default warehouse, default project, payment method, paid-now, notes, files) plus
the line-item grids. Users focused on a quick create face a wall of options.

## Constraints (must not regress)

- **#24 line-default seeding + XOR**: in `handleSubmit`, lines that leave their own
  warehouse/project unset inherit the header default; a line that picks one never
  inherits the other. `validateForm` rejects both-set at header and line level.
  The aim is to *move*, never *alter*, these fields and the submit payload.
- **i18n keyed + RTL-safe**: keep existing `t()` usage; new labels go through the
  `ar` resource (`apps/web/src/i18n/resources/ar.ts`). `scripts/check-i18n-keys.mjs`
  fails on any t() key missing from the resource without a fallback.
- **Density-first design**: sections are compact (border + chevron header), not
  heavy cards; collapse must not add page height.

## Design

### New primitive — `CollapsibleSection` (`apps/web/src/components/ui/collapsible-section.tsx`)

- Props: `title`, `description?`, `children`, `defaultOpen = false`, `className?`,
  `contentClassName?`.
- Button header: full-width, `aria-expanded`, `aria-controls` -> content `role="region"`
  with `aria-labelledby`. ChevronDown when collapsed / ChevronUp when expanded
  (direction-neutral, RTL-safe). Content is conditionally rendered (not mounted)
  so hidden fields are out of both the layout and the a11y tree.
- Open state is component-local `useState` — one instance per section on the page,
  so it survives parent re-renders (adding/removing line items re-renders the page
  but does not remount sections).

### Page regroup (`inventory-invoice-create-page.tsx`)

| Block | Content | Default |
| --- | --- | --- |
| Essential (always) | رقم الفاتورة، التاريخ | visible |
| `invoiceCreate.debtSection` "الدين والدفع" | هل هذه دين؟ + (when YES) طريقة الدفع + المدفوع الآن | collapsed |
| `invoiceCreate.counterpartySection` "ربط بجهة خارجية" | الجهة الخارجية + اسم المورد | collapsed |
| `invoiceCreate.defaultsSection` "المستودع والمشروع الافتراضي" | المستودع الافتراضي + المشروع الافتراضي | collapsed |
| `invoiceCreate.notesSection` "ملاحظات وملفات" | ملاحظات + ملفات | collapsed |

All existing fields, their state hooks, `validateForm`, XOR clearing
(`setWarehouseId(id); setProjectId("")`), and the submit payload are unchanged —
the JSX is regrouped only. Sections render inside the existing
`Surface variant="panel"` header area; grids keep `md:grid-cols-2/3` density.

### Tests

Unit (`inventory-invoice-create-page.test.tsx`):
- Existing #24 suite updated: open "المستودع والمشروع الافتراضي" section first
  (fields hidden until toggled), then re-run seeding/XOR assertions unchanged.
- New disclosure cases: essential fields visible by default; debt select hidden
  until section opened; counterparty/supplier hidden; warehouse/project hidden;
  notes/files hidden; payment fields only when debt section open AND isDebt=YES;
  values survive close/reopen (state survives toggle).

E2E (`tests/e2e/`):
- `inventory-invoice-create.spec.ts`: open the defaults section before the
  warehouse combobox interaction (keeps the #24 seeding proof intact).
- New `inventory-invoice-progressive-disclosure.spec.ts`: essential path shows
  number/date/grid and hides debt/counterparty/warehouse/notes fields
  (`toHaveCount(0)`); then a full create with every section expanded (debt=YES,
  payment method, paid amount, counterparty, supplier, warehouse, project, note)
  lands on the details view.

## Risks

- Existing unit/E2E tests assume fields are immediately visible — must update in
  the same change or the suite goes red.
- Conditional rendering means `getByLabel` on collapsed fields must be asserted
  via count 0, not `toBeHidden` (element is not in the DOM).
- i18n drift gate: every new t() key must exist in `ar.ts`.
- Playwright exclusivity: this lane owns the full E2E run; ports 3000/4318 must
  be free first.

## Validation plan

`pnpm --filter @tuari/contracts build`; `pnpm typecheck`; `pnpm lint`;
`pnpm test:api`; `pnpm test:web`; full `npx playwright test --reporter=list`;
Guard Phase 1+2; evidence under `.scratch/reviews/25/`; Greptile CLI review;
push to `origin/fix/issue-25-invoice-disclosure` (no PR, no merge).