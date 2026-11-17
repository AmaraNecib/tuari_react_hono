# Employee table salary approval entry

## Scope and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-a7117ef1-fcf368d5c6f21d98`
- Base: `629419e779e514b42f479d5a42b1c5ef461ff770` (`feat(web): display exact salaried worker references`), based on parent commit `a7c9948b` plus the salary-reference table commit.
- Verification: `focused-local / CI-final-pending`.
- Review tier: high assurance. This changes the exact salary-reference input at a reachable employee approval action.
- Writable scope: employee-table source, its dedicated test, and this design note.
- Local-only worker scope. No push, PR, merge, release, detail-page or broader UI work.

## Interface and decisions

`EmployeeTableRow.salaryReference` is optional and has the exact shape `{ period, amount: string } | null`. The table snapshots only employee ID and name when the action opens. It resolves the current row by ID and passes the current optional reference to the existing approval dialog. The entry remains available when no reference exists. The reference is metadata, not a payment ceiling or a reason to block entry.

Project choices remain available through `projects`. Project assignment windows are not passed into the approval composer. The table keeps its optional `projectAssignmentsByEmployeeId` type-only compatibility prop because `employees-section.tsx` still supplies it; the table does not read those values. Its type comes from `@tuari/contracts`.

Table structure, row action visibility/permissions, and parent-owned sorting and pagination do not change. No module seam moved; the existing composer remains the dialog boundary.

## Tests and proof

The dedicated table test renders the real `AddSalaryPaymentDialog` through the table action. It checks exact reference submission, entry without a reference, and a refreshed reference/name while employee ID remains unchanged. Composer/helper and localization files are outside this change.

Imported shared composer commits, separate from this authored fix:

- `a28376d3` Replace salary dialog with earned-wage approval composer.
- `8738fe05` Label approval rows by their position.

Direct consumers of the old numeric `EmployeeTableRow` fields, including employee details, remain outside this writable scope and must be reported if type checks expose errors.
