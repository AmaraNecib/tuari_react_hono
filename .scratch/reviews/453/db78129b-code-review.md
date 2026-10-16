# Code review — #453 extract the per-tab salary table modules

Base: `551948e4` (`origin/develop`). Reviewed HEAD: `db78129b`.
Two fresh-context reviewers, one per axis. Findings below are verbatim in
substance, grouped by axis.

## Standards

Module boundaries now match the two concepts: `salaries-section.tsx` holds only
`activeTab`, the payment target and the live worker lookup; each table owns its
query, filters, pagination and empty state. Row types are exported from the
owning module and imported by the shell instead of restated.

Shared primitives are genuinely shared: `MoneyCell`, the period vocabulary and
the three filter fields each have two consumers, and the period helper has a
third (`employee-details-page.tsx`, whose local copy was deleted). No
pass-through wrapper, no second pagination implementation.

Dead code is deleted: the shell's six `useState`s, four memos, two predicates
and two `usePaginatedRows` calls; the duplicated period switch in
`employee-details-page.tsx`. i18n uses existing keys only.

Judgement-call notes, with dispositions:

| id | note | decision |
| --- | --- | --- |
| S1 | The 12-line pagination block is repeated in both tables (Fowler Duplicated Code, minor). | Dismissed: the design pass already weighed this (A6). A `SalaryPaginationControls` wrapper would be shallow, and the sibling `system-log-section.tsx` inlines the same two lines. Follow-up only if a third table appears. |
| S2 | `employeePhone` is declared on both row types but never rendered. | Dismissed: pre-existing in the base inline type; the extraction did not make it worse. Removing a workspace-shaped field is out of scope for a pure refactor. |
| S3 | `getSalaryPeriodLabelKey` returns `string` not a key union; `sortProjectsByName<T>` is mildly speculative. | Dismissed: pre-existing typing; out of scope. The sort helper has two consumers and is documented in the design doc. |
| S4 | `salaries-section.tsx` carried two stacked JSDoc blocks including stale `@description Component` boilerplate. | Fixed in `db78129b`. |
| S5 | `salaries-section.test.tsx` is not literally unchanged (+the new tab-state test). | Accepted: no pre-existing assertion was removed, so the equivalence check holds; the addition pins pre-refactor behaviour. Design doc corrected. |

Net: the diff strictly improves the codebase; the worst drift risk it removed
was the duplicated period-label mapping.

## Spec

Against issue #453, every requirement is present:

- shell is thin — `activeTab` + `paymentTarget` + the live lookup only;
- each module owns its filters, query, pagination and empty state;
- shared primitives stay shared (one `salary-table-primitives.tsx`);
- a test per extracted module (three new files);
- the parent addendum is satisfied: `employee-details-page.tsx` imports the
  shared `getSalaryPeriodLabelKey`, the local copy is gone, and
  `salary-table-primitives.test.ts` pins DAILY/WEEKLY/MONTHLY/null plus the
  option list.

Line-by-line equivalence holds for predicates, `resetPageDeps`, empty-state key
choice, column order, and the `onAddPayment`/`onEditSalary` wiring.

No blockers found on either axis. The only respecified item was the design doc's
stale "tabs are conditionally rendered" premise and its "test unchanged" claim,
both corrected in the doc update that accompanies this evidence.
