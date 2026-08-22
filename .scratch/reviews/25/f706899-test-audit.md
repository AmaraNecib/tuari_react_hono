# Test audit — issue #25 progressive disclosure (HEAD f706899)

Ran per `.agents/skills/test-audit/SKILL.md` (Standard tier requires it) with 3 parallel
sub-agents (edge case hunter, coverage analyst, quality reviewer) against the test files +
sources. Base `fbb7d02`, review tier Standard.

## Criteria → coverage (all 9 covered)

| Criterion | Unit | E2E |
|---|---|---|
| (a) essential path visible | "shows only the essential create path fields by default" | essential-path spec (toBeVisible + toHaveCount(0)) |
| (b) debt gated on open AND yes | "shows debt fields only when…'is this a debt?' is yes" | full-create selectOption("YES") |
| (c) counterparty/supplier hidden | "reveals the counterparty/supplier fields only after opening" | toHaveCount(0) |
| (d) warehouse/project hidden | "reveals the default warehouse/project fields only after opening" | toHaveCount(0) |
| (e) notes/files hidden | "reveals the notes/files fields only after opening" | toHaveCount(0) |
| (f) state survives close/reopen | 2 tests (debt values; warehouse selection) | n/a (unit by design) |
| (g) state survives line re-render | "keeps sections expanded…added or removed" (+#24 across-re-renders) | full-create step 4 |
| (h) #24 seeding/XOR | 6-test describe | inventory-invoice-create.spec.ts + DB seam |
| (i) full create expanded | debt+payment payload submission (AMOUNT, 1500.5) | full-create + DB seam (supplier, counterparty, warehouse, note, paid 500, remaining>0, 2 entries inherit warehouse, attachment row) |

## Edge case hunter — findings + disposition

| # | Risk | Finding | Disposition |
|---|------|---------|-------------|
| 1 | 🔴 | Debt paid-value bounds unvalidated (negative / percent>100 reach the API; page:188-189) | **Deferred** — pre-existing API-facing behavior, out of #25 disclosure scope; decision request filed with parent |
| 2 | 🟠 | `validateForm` error branches untested; `void handleSubmit()` rejects unhandled on validation failure | Deferred (pre-existing logic, out of scope) |
| 3 | 🟠 | Fractional/overflow quantity guards untested (`toFixed` on huge input → Infinity) | Deferred (pre-existing numeric validation gap) |
| 4 | 🟠 | Toggle-close while a create mutation is pending (CreateableSelect resumes after unmount) | Noted; works because state is page-lifted; no test added (low risk, would need fake timers for mutation latency) |
| 5 | 🟠 | `uploadInvoiceAttachments` never asserted | **Fixed** — E2E now attaches an in-limits PNG through the notes section and pins `inventory_invoice_attachment.original_name` in the DB seam |
| 6 | 🟡 | Line-delete re-render vs section state | **Fixed** — re-render unit test now also removes a line and asserts sections stay open |
| 7 | 🟡 | Long Arabic labels / RTL ellipsis | Noted, cosmetic; `truncate` + `text-start` |
| 8 | 🟡 | Total vs qty×price mismatch ships silently | Deferred (pre-existing design: total is user-editable) |

## Coverage analyst

- All 9 criteria covered at unit and/or E2E. Diversity good (queryBy-absent semantics,
  aria-expanded, getByLabelText value checks, Base UI combobox simulation, E2E + SQLite seam).
- Duplicate coverage: (a)-(e) intentionally layered (unit not-mounted vs E2E toHaveCount(0)) —
  accepted per engineering practice; (h) payload vs DB rows are complementary.
- Missing: primitive-level spec for `CollapsibleSection` → **Fixed** in f706899
  (`collapsible-section.test.tsx`: default collapsed content not mounted, `defaultOpen`,
  toggle + region wiring, state survives rerender).

## Quality reviewer — grade B, findings + disposition

| Finding | Disposition |
|---|---|
| byte-identical `beforeEach` in both describes | **Fixed** — hoisted into `mockQueries()` |
| `.not.toBeNull()` on `getByText` is redundant (getBy throws) | Kept — harmless; removing bare-expression asserts risks `no-unused-expressions` lint |
| 10s budgets ×8 repeated | **Fixed** — `BASE_UI_TIMEOUT` const with single rationale; assertions unchanged |
| `act()` double-wrap on add-line clicks | Kept — repo-established pattern for Base UI async popup settle |
| E2E serial shared vars order-dependence | Kept — `mode: "serial"` + `beforeAll(reset)` match existing specs |
| async handling, scope to portal listbox, waitFor hard asserts | Positive — no change needed |

## Post-audit validation

- `npx vitest run src/components/ui/collapsible-section.test.tsx src/features/inventory/inventory-invoice-create-page.test.tsx` ✓ (19 tests)
- web `tsc --noEmit` ✓, `eslint` on changed files ✓
- Invoice E2E specs ✓ (5/5 incl. attachment row pin); full suite rerun below.

Grade after fixes: B+ (missing edge cases are pre-existing business-validation gaps, tracked as deferred).