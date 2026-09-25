# Issue #24 — Invoice header-level warehouse/project custom comboboxes don't persist selection

- mode: local-only (GitHub remote unavailable; source of truth = local checkout)
- ticket #24 (pipeline crew lane), branch `fix/issue-24-ticket`
- base SHA: `7097719c8b5e6526bf1386484e8750b1d5443d71` (diff vs `origin/develop` cached ref)
- review tier: Standard

## Problem

On the invoice creation page
(`apps/web/src/features/inventory/inventory-invoice-create-page.tsx`, route
`/invoices/create`) the HEADER-level "default warehouse" (المستودع الافتراضي)
and "default project" (المشروع الافتراضي) custom comboboxes do not reliably
retain their selected value after interaction/re-render, and the header
defaults do not flow down to line items that leave their own warehouse/project
unset.

Header comboboxes use `CreateableSelect` (`@/components/ui/createable-select`),
a custom combobox built on Base UI `Select`. Line-item warehouse/project use a
native `<select>` (`NativeSelect`) and persist correctly — so the bug is
specific to the custom combobox section.

## Diagnosis (root cause)

`CreateableSelect` renders:

```tsx
<Select value={value} onValueChange={handleValueChange} disabled={disabled}>
  <SelectTrigger className={className}>
    <SelectValue
      placeholder={resolvedEmptyLabel}
      children={displayValue && displayValue.length > 0 ? displayValue : undefined}
    />
  </SelectTrigger>
  <SelectContent>
    ...
  </SelectContent>
</Select>
```

- The **display** of a closed Base UI select resolves the selected label by
  matching `value` against the registered items and falls back to
  `stringifyAsLabel(value)` (the raw id string) when no item matches — so the
  trigger never shows the friendly name unless `displayValue` is passed.
- On the invoice page `displayValue` is never passed, so even when state is
  held the trigger cannot render the selected item's name inside jsdom / closed
  popup, and any re-render that (re)mounts the select degenerates the display
  back to the placeholder (بدون مستودع / بدون مشروع).
- The header selections are also purely cosmetic: `handleSubmit` sends the
  header `warehouseId`/`projectId`, but each line entry always sends its own
  value and there is no fallback to the header defaults
  (`line.warehouseId || null`), so a line that leaves its own warehouse/project
  as "default" posts `null` instead of inheriting the header default.

## Fix

1. **`CreateableSelect`**: require/encourage passing the selected option's name
   via `displayValue` and render it — do not rely on Base UI label resolution
   for the closed trigger. Compute the display text internally so callers do
   not have to thread it through: `displayValue` prop stays, but if omitted,
   derive it from the matched option (`options.find((o) => o.id === value)?.name`).
   Keep `SelectValue.placeholder` for the empty case. This makes the selected
   value visible and stable across re-renders.

2. **`inventory-invoice-create-page.tsx`**:
   - Keep the header state lifted (`warehouseId`/`projectId` useState) — it is
     already correct; the combobox just needs to display it.
   - Seed line-item defaults: when a line item leaves its own warehouse/project
     unset, fall back to the header default at submit time
     (`line.warehouseId || warehouseId` and `line.projectId || projectId`),
     preserving "default" as a live default rather than freezing values at line
     creation.
   - Update the header combobox usage to pass/use the display-name so the
     selected warehouse/project stays visible (via the derived-name behavior in
     `CreateableSelect`, no page change strictly needed beyond tests).

## Tests

- `apps/web/src/features/inventory/inventory-invoice-create-page.test.tsx`
  (new, jsdom): mocks `./inventory-hooks` and
  `@/features/app-shell/workspace-mutations`; asserts
  1. selecting a default warehouse in the header combobox persists in form
     state and the trigger displays the warehouse name,
  2. the selection survives a re-render (adding a line item) and the submit
     payload carries `warehouseId: "wh-1"`,
  3. a line item that leaves its own warehouse/project unset inherits the
     header defaults in the submit payload (`entries[0].warehouseId === "wh-1"`),
     while a line item that chooses its own value keeps it.
- `CreateableSelect` unit test (new) for the display-name derivation and
  `onChange` flow (createable path unchanged).

## Risks / notes

- Base UI Select in jsdom: interaction via `fireEvent.mouseDown` on the
  trigger, then click on `role="option"`. Portal renders into `document.body`.
- No Playwright E2E currently exists for the invoice create flow
  (`tests/e2e/` has none for `/invoices/create`); per the feature-implement
  skill a user-facing feature needs one, so a thin E2E spec is added
  (`tests/e2e/inventory-invoice-create.spec.ts`) covering header selection
  persistence where the existing test harness permits.
- The mutual-exclusion validation (header warehouse XOR project, per-line
  warehouse XOR project) is preserved; seeding only applies to unset fields and
  never creates a warehouse+project pair on a line.