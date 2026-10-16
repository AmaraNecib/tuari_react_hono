# Design pass — #453 (extract the per-tab salary table modules)

Reviewed diff: `551948e4...db78129b` (the whole change, not just the new files).
Lenses applied: `domain-modeling`, `codebase-design`, and
`improve-codebase-architecture` (friction + deepening opportunities). Base SHA
`551948e4` == `origin/develop`; the branch was rebased here from the earlier
`e526acec` base.

Files in the diff: `salaries-section.tsx` (rewritten as a ~95-line shell),
`salary-payments-table.tsx`, `salaried-workers-table.tsx`,
`salary-table-primitives.tsx`, the two new module tests, the new
`salary-table-primitives.test.ts`, `employee-details-page.tsx` (the local period
label copy deleted, the shared helper imported), and `salaries-section.test.tsx`
(every pre-existing assertion kept, plus the tab-state round-trip test).

## domain-modeling

- Vocabulary is unchanged and reused: worker, salary payment, wage period,
  project split, project, salaried worker. The new type names
  (`SalaryPaymentRow`, `SalariedWorkerRow`) name the existing tab concepts, not
  new ones.
- "An unknown wage period is treated as a month" was already stated once in
  `effectiveSalaryPeriod` (contracts). The period *label* mapping was stated
  twice (the salary section and `employee-details-page.tsx`); it is now stated
  once in `salary-table-primitives.tsx` and consumed by the two tables and the
  employee details page. The duplicate is deleted, not left behind.
- No new domain term needs `CONTEXT.md`. The salary area still has no
  `CONTEXT.md` (pre-existing gap, noted in
  `.scratch/reviews/fix-salary-screen/design-pass.md` as A4) — not made worse
  here.

## codebase-design

- **The shell is now deep.** `SalariesSection`'s interface is four props; its
  implementation is "pick a tab". It no longer carries either pipeline.
- **Deletion test on `salary-table-primitives.tsx`**: deleting it re-duplicates
  `MoneyCell`, the period vocabulary (`SALARY_PERIOD_FILTER_VALUES` +
  `getSalaryPeriodLabelKey`) and the three identical filter fields across two
  table modules — and re-forks the label mapping a third time in
  `employee-details-page.tsx`. Complexity reappears → it earns its keep.
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
  the rendered DOM; `salary-table-primitives.test.ts` pins the shared period
  vocabulary through the exported function; `salaries-section.test.tsx` crosses
  the shell's seam and pins the tab-state round trip.
- **Red/green teeth.** Both module tests fail pre-fix (module absent). Changing
  the `WEEKLY` label key to the `DAILY` key failed exactly the two mapping tests
  in `salary-table-primitives.test.ts`. The original claim that dropping a filter
  from each `resetPageDeps` failed exactly its reset test was **wrong for two
  cases**: the payment search and worker worker-filter tests filtered to a
  single row, which the page clamp masked, so a deleted reset dep stayed green.
  The aggressive review round rebuilt those fixtures to span two pages and
  re-ran every dep mutation; each now fails exactly its own test (see
  `db78129b-test-audit.md`).
- **State preservation is part of equivalence.** The extraction moved filter and
  pagination state into conditionally-rendered children, which reset each tab on
  a switch; the base held it in the shell. `a489b24c` keeps both tables mounted
  with the inactive one `hidden`, and the new shell test pins the round trip.
- **Pagination is still the shared implementation**, not a second one: both
  tables call `usePaginatedRows` + `TablePaginationControls`.

## improve-codebase-architecture

Friction the diff created, and the opportunities it reveals:

- **In scope, fixed here:** the 490-line two-pipeline section is gone; the shell
  is 95 lines and each table is one concept, testable on its own.
- **In scope, fixed here (parent decision):** the period label mapping is one
  implementation again. `employee-details-page.tsx` now imports
  `getSalaryPeriodLabelKey` from `salary-table-primitives.tsx` instead of
  carrying its own copy, and a per-period test pins the mapping. The alternative
  of a follow-up PR was rejected because this PR *created* the shared module the
  page should consume.
- **The cross-feature import is accepted friction.** `features/employees` →
  `features/app-shell/salary-table-primitives` for a pure helper. The codebase
  already cross-imports between these two features (`mock-dashboard`,
  `workspace-mutations`, the sections), and the page already imports every UI
  primitive the module pulls, so no new dependency weight is added. If a third
  feature consumes the helper, promote it to `features/shared/`.
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
| A4 | `getSalaryPeriodLabelKey` also copied in `employee-details-page.tsx` | **fixed here** (parent decision) — copy deleted, shared helper imported, labels pinned per period |
| A5 | two money renderers (`MoneyCell` vs `renderMoneyValue`) | pre-existing (old A3); follow-up, not this PR |
| A6 | pagination-bar conditional + page-size reset repeated per table | justified as-is — shared primitives carry paging; matches sibling tables |
| A7 | salary area has no `CONTEXT.md` | pre-existing (old A4); follow-up if the domain grows |
| A8 | `features/employees` imports a helper from `features/app-shell` | accepted — existing cross-feature norm, no new UI weight; promote to `features/shared` at a third consumer |
| A9 | tab switch reset each tab's query/filters/page (state moved into unmounted children) | **fixed** (`a489b24c`) — both tables stay mounted, inactive one `hidden`; shell test pins it |
| A10 | payment worker/period filters and worker search/project reset deps had no failing mutation (page clamp masked two of them) | **fixed** (`db78129b`) — fixtures rebuilt, every dep mutation-verified |

Nothing was left silent: the pass ran on the full diff and the items above are
the complete result. No in-scope finding remains unfixed except A9/A10, which the
aggressive review round fixed and this pass now records.

## Aggressive review round (HEAD `db78129b`)

The parent ran the debate, Standards+Spec code review and test audit on
`551948e4...db78129b`. The one behaviour regression (A9) and the toothless
resets (A10) were fixed; the stale design-doc claims about "conditionally
rendered" tabs and an "unchanged" shell test were corrected. Dismissed, with the
reason recorded: extracting a `SalaryPaginationControls` wrapper for the shared
12-line pagination block (A6 stands) and removing the unused `employeePhone`
field (pre-existing, out of scope). Evidence:
`.scratch/reviews/453/db78129b-{debate,code-review,test-audit}.md`.
