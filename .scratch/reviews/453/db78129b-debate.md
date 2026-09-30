# Debate — #453 extract the per-tab salary table modules

Base: `551948e4` (`origin/develop`). Reviewed HEAD: `db78129b`.
Mode: remote (this lane does not push). Tier: **High-assurance local merge gate**
— the parent asked for a debate even though the change is UI-only, because a
refactor's contract is "nothing changed" and a missed behaviour change is a bug.

Two fresh-context reviewers ran on the finished diff: a harsh critic and a
charitable defender. The findings below are the parent's synthesis, not either
raw child output. Every claim was re-checked against the code path.

## What the critic confirmed unchanged

The critic walked each named hunt hypothesis against the pre-refactor shell
(`git show 551948e4:apps/web/src/features/app-shell/salaries-section.tsx`) and
found no surviving behaviour change:

- filter → paging reset arrays are byte-identical (`salary-payments-table.tsx:117`,
  `salaried-workers-table.tsx:92`);
- the page clamp is still the shared `usePaginatedRows` (`table-primitives.tsx`);
- empty states match, including `colSpan` 7 / 4 and the `length === 0` key choice;
- no loading state was added (the base had none);
- the dialog's live worker lookup is unchanged (`salaries-section.tsx:34-36`);
- sort order, `MoneyCell` defaults and the period-label mapping are identical;
- `EmployeeTableRow["salaryPeriod"]` is `SalaryPeriodType | null`, so the widened
  helper parameter is a superset with the same branches.

## Findings

| id | finding | sev | verdict |
| --- | --- | --- | --- |
| C1 | Tab switch used to keep each pipeline's filters/page because the state lived in the shell; the extraction commit moved state into conditionally-rendered children, so switching tabs reset it. | 7 (high among findings) | **CONFIRMED behaviour regression**, fixed at `a489b24c`: both tables stay mounted, the inactive one is `hidden`. New test `salaries-section.test.tsx` "keeps each tab's page and filter when the operator switches tabs" fails at the extraction head and passes here. |
| C2 | `getByText` does not honour `hidden`, so with both tables mounted a shared `employeeName` can appear twice to a text query. | 2 | Acknowledged, no code change. Role and label queries exclude hidden content; the shell tests scope row assertions with `within(getByRole("table"))`; the E2E uses role locators. The alternative (lifting all state back into the shell) would undo the extraction. Documented in the design doc. |
| C3 | `salary-table-primitives.tsx` said the period helper carried an "unknown means a month" default, but it returns `notSpecified` for null. | 1 | Confirmed, comment corrected in `db78129b`. |
| C4 | Each table now sits in an extra `<div hidden>` instead of a bare `<div className="space-y-4">`. | 1 | Dismissed. `display: none` paints no margin, so the `space-y-6` rhythm is unchanged; the wrapper is what keeps state alive. |

## Defender points

The defender argued the module boundary matches the two already-separate
pipelines, that the shared primitives each have two real consumers, and that the
live dialog lookup must stay in the shell. Its honest flags were C2 and the stale
design-doc wording (fixed in the doc update, see below).

## Parent decision

C1 fixed. C3 fixed. C4 dismissed with the code path above. C2 accepted as the
known cost of module-owned state and recorded in the design doc.
