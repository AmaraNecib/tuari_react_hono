# Design pass — #453 (extract the per-tab salary table modules)

Reviewed diff: `e526acec...5eb3941b` (the whole extraction, not just the new
files). Lenses applied: `domain-modeling`, `codebase-design`, and
`improve-codebase-architecture` (friction + deepening opportunities). Base SHA
`e526acec` == `origin/develop`.

Files in the diff: `salaries-section.tsx` (rewritten as a ~95-line shell),
`salary-payments-table.tsx`, `salaried-workers-table.tsx`,
`salary-table-primitives.tsx`, the two new module tests, and the unchanged
`salaries-section.test.tsx`.

## domain-modeling

- Vocabulary is unchanged and reused: worker, salary payment, wage period,
  project split, project, salaried worker. The new type names
  (`SalaryPaymentRow`, `SalariedWorkerRow`) name the existing tab concepts, not
  new ones.
- "An unknown wage period is treated as a month" was already stated once in
  `effectiveSalaryPeriod` (contracts) and once as the period label default in the
  shell. The label default is now stated once in `salary-table-primitives.tsx`
  and consumed by both tables; it did not gain a third copy.
- No new domain term needs `CONTEXT.md`. The salary area still has no
  `CONTEXT.md` (pre-existing gap, already noted in
  `.scratch/reviews/fix-salary-screen/design-pass.md` as A4) — not made worse
  here.

## codebase-design

- **The shell is now deep.** `SalariesSection`'s interface is four props; its
  implementation is "pick a tab". It no longer carries either pipeline.
- **Deletion test on `salary-table-primitives.tsx`**: deleting it re-duplicates
  `MoneyCell`, the period vocabulary (`SALARY_PERIOD_FILTER_VALUES` +
  `getSalaryPeriodLabelKey`) and the three identical filter fields across two
  table modules. Complexity reappears → it earns its keep. Its three concerns are
  cohesive (presentation shared by exactly the two salary tables) and it is small
  (~150 lines); splitting it into three near-empty modules would be interface
  noise, not depth.
- **Deletion test on each shared filter field** (`SalarySearchField`,
  `SalaryProjectFilterField`, `SalaryPeriodFilterField`): each has two real
  consumers; deleting any one re-duplicates its label set and options. Kept.
- **No hypothetical seam.** The two tables' filter predicates differ
  (`projectSplits` vs `projectAssignments`, a worker filter only the payment
  table has), so those stay per-table. A single generic filter hook would be a
  seam with one shape and one near-shape — rejected, as in the original design
  pass.
- **The interface is the test surface.** The new `salary-payments-table.test.tsx`
  and `salaried-workers-table.test.tsx` drive the modules through their props and
  the rendered DOM; they do not reach into internals. The unchanged
  `salaries-section.test.tsx` crosses the shell's seam. Both module tests fail
  pre-fix (module absent) and pass post-extraction; a targeted mutation (dropping
  the filter from `resetPageDeps`) failed exactly the two filter tests, proving
  they are not vacuous.
- **Pagination is still the shared implementation**, not a second one: both
  tables call `usePaginatedRows` + `TablePaginationControls`.

## improve-codebase-architecture

Friction the diff created, and the opportunities it reveals:

- **In scope, fixed here:** the 490-line two-pipeline section is gone; the shell
  is 95 lines and each table is one concept, testable on its own.
- **Pre-existing, unchanged:** `getSalaryPeriodLabelKey` now lives in
  `salary-table-primitives.tsx` *and* `employee-details-page.tsx` (before this
  diff it was in `salaries-section.tsx` and `employee-details-page.tsx`). The
  extraction does not add a copy and creates a shared home the employee details
  page could adopt. Proposed follow-up: have `employee-details-page.tsx` import
  the shared helper. Out of this PR's scope (touches an unrelated feature file);
  **parent decision requested before filing**.
- **Pre-existing, unchanged:** `MoneyCell` vs `renderMoneyValue` are still two
  money renderers (originally filed as A3). No new copy added.
- **Justified as-is:** the pagination-bar conditional and the page-size reset
  (`setPage(1)` before `setPageSize`) are repeated in both tables. The shared
  `TablePaginationControls`/`usePaginatedRows` carry the paging behaviour; the
  wrapper would be shallow, and the sibling `system-log-section.tsx` inlines the
  same two lines. Follow-up only if a third table appears.

## Findings and decisions

| id | finding | decision |
| --- | --- | --- |
| A1 | `SalariesSection` owned two pipelines (~490 lines) | **fixed here** — shell + two table modules |
| A2 | shared period label/vocabulary would fork across two modules | **fixed here** — one `salary-table-primitives` module |
| A3 | identical filter fields would be copy-pasted per table | **fixed here** — shared search/project/period fields |
| A4 | `getSalaryPeriodLabelKey` also copied in `employee-details-page.tsx` | pre-existing; proposed follow-up, needs parent decision |
| A5 | two money renderers (`MoneyCell` vs `renderMoneyValue`) | pre-existing (old A3); follow-up, not this PR |
| A6 | pagination-bar conditional + page-size reset repeated per table | justified as-is — shared primitives carry paging; matches sibling tables |
| A7 | salary area has no `CONTEXT.md` | pre-existing (old A4); follow-up if the domain grows |

Nothing was left silent: the pass ran on the full diff and the items above are
the complete result. No in-scope finding remains unfixed.
