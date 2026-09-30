# Design pass — salary screen (items 5/6/7)

Diff reviewed: `55b71181...HEAD` (the whole change, not just new modules):
`salaries-section.tsx`, `add-salary-payment-dialog.tsx`,
`salary-payment-form.ts`, `ar.ts`, and the tests. Lenses applied:
`domain-modeling`, `codebase-design`, `improve-codebase-architecture`.

## domain-modeling

- Glossary checked. There is no `CONTEXT-MAP.md` and no `docs/domain/CONTEXT.md`;
  the root `CONTEXT.md` is scoped to **Diagnostics & Telemetry** and is not the
  salary glossary. The existing salary vocabulary lives in `salary-days.ts`
  docstrings.
- The diff uses the existing terms — worker, salary payment, wage period, days,
  project split, project — and introduces no new domain term.
- **One rule was stated twice by my own first cut** and is now fixed: "an unknown
  wage period is treated as a month" appeared in `defaultSalaryPaymentDays` and
  again in the dialog's amount default. It now lives once as
  `effectiveSalaryPeriod()` in `salary-payment-form.ts`, consumed by both. See
  finding D1.
- The "payment needs the worker's wage and period" rule is stated at two seams on
  purpose: the API enforces it (`WorkforceService.createSalaryPayment`) and the
  web pre-checks it to avoid a silent refusal. That is a server/client split, not
  a duplicated domain rule; the API stays the authority and the web strings are
  UX copy. Known drift risk (finding D2), justified as-is.
- No ADR offered: the unknown-period default is easy to reverse, unsurprising, and
  not the result of a hard trade-off.

## codebase-design

- **`SalaryFilterField` was shallow and is now deleted.** It was a near-copy of
  the existing `Field` primitive (`components/ui/field.tsx`) — same
  `<label><span>{label}</span>{children}</label>` shape, minus error/hint. The
  deletion test: deleting it and using `Field` does not make complexity reappear,
  because the primitive already exists. Keeping it would have left a second copy
  of the field rule to drift. Fixed here (finding C1).
- **`effectiveSalaryPeriod` earns its keep.** Small interface, but deleting it
  re-duplicates the `?? "MONTHLY"` convention across the day default and the
  amount default, so the complexity reappears. Kept.
- **Pagination is not a second UI.** Both tables cross the same seam as the
  invoices/items pages (`usePaginatedRows` + `TablePaginationControls`); deleting
  the shared hook would reappear the paging/clamping logic in every table.
- **The interface is the test surface.** The new page tests drive
  `SalariesSection` through its props and the rendered DOM; they do not reach into
  internals, so an extracted table would keep the same tests.
- **No hypothetical seam introduced.** The two per-tab filter pipelines were left
  un-abstracted: the filter fields differ (payment rows vs worker rows), so a
  single generic filter hook would be a seam with one real shape and one
  near-shape. Justified as-is.
- No second copy of a money rule: rows keep integer DZD through the existing
  `computeProposedSalaryAmount` / `roundMoneyToCents` helpers; no float.

## improve-codebase-architecture

Friction the diff created, and the deepening opportunities it reveals:

- **`salaries-section.tsx` grew from 271 to ~490 lines** and now owns two full
  table pipelines (search + filters + pagination) plus the payment dialog.
  Deepening candidate: extract `SalaryPaymentsTable` and `SalariedWorkersTable`
  modules that each own their own control state behind a small interface
  (`payments`/`workers`, `projects`, `onAddPayment`, `onEditSalary`), leaving
  `SalariesSection` a thin tab shell. Recommendation: **follow-up**, not this PR.
  Reasons: the two-tables-in-one-section shape predates this lane; the nearest
  sibling (`system-log-section.tsx`, 319 lines) already keeps filters +
  pagination in one section, so this matches the codebase style; and stacking a
  ~250-line structural move on an owner-facing change would obscure it. If the
  tables grow another concern each, promote it.
- **The filter/pagination state is duplicated across the two tabs** (two
  `usePaginatedRows` calls, two `resetPageDeps` lists, two search normalisers).
  Not extracted, because the predicates differ; the shared hook already carries
  the paging behavior. Follow-up only if a third table appears (that would be the
  second real adapter and justify a generic `useTableControls`).
- **Pre-existing, not introduced:** `MoneyCell` here and `renderMoneyValue` in
  `employee-details-page.tsx` are two money renderers. Out of this diff's scope;
  note it for a future consolidation.
- **Domain glossary gap:** the salary area has no `CONTEXT.md` while telemetry
  does. Follow-up if the salary domain keeps growing.

## Findings and decisions

| id | finding | decision |
| --- | --- | --- |
| D1 | "unknown period = month" stated twice | **fixed here** — single `effectiveSalaryPeriod` helper |
| C1 | `SalaryFilterField` shallow copy of `Field` | **fixed here** — deleted, reuse `Field` |
| A1 | `SalariesSection` owns two table pipelines (~490 lines) | follow-up issue (extraction), justified not-now |
| D2 | client save-reason vs API precondition strings can drift | justified as-is (server is authority; client is UX) |
| A2 | duplicated filter wiring across the two tabs | justified as-is (differing predicates; shared hook carries paging) |
| A3 | two money renderers (`MoneyCell` vs `renderMoneyValue`) | pre-existing; follow-up, not this PR |
| A4 | no salary `CONTEXT.md` | follow-up if the domain grows |

Nothing was left silent: the pass ran on the full diff and the items above are
the complete result.
