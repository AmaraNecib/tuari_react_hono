# Salary entry and approved earnings history

- Worktree: `D:/worktrees/tuari_react_hono/t3-baefa5d7-276205dfd2f06aa3`
- Parent base: `629419e779e514b42f479d5a42b1c5ef461ff770`
- Verification mode: `focused-local / CI-final-pending`
- Review tier: high-assurance. This changes the operator's approved financial readback; exact DZD values and ordered project allocations must stay intact.
- Scope: update only the original salaries-section payment entry point and add its approved-earnings history view. Preserve historical cash payments as a separate read-only table. No employee list/detail changes, database or numeric payment implementation.
- Imports from parent-owned composer work: `a28376d34fdc04c76a22987867d41ce90e5da344`, `8738fe051a7a70b09f5893e3d2efd97aa2c4dcf3`, and reviewed follow-up `2f43adc34ab23a9caa3d8c366f6f97df1d203916`. These commits are imported dependencies, not authored here.
- Expected interface: pass `salaryReference` (`{ period, amount } | null`) to the approval composer; it remains optional context, not an earning balance or ceiling. Read approved history through `useEmployeeEarningsQuery(employeeId?)` and render the server's exact totals, unallocated amount, and ordered segments without computing allocations. `EmployeeEarningsHistory` accepts optional `employeeNames` and `projectNames` records from caller-owned query data; missing names fall back to the stored IDs as diagnostics.
- Proof: salaries entry opens the approval composer with the worker's exact optional reference; approved history renders the fixture total `62500`, unallocated amount, and ordered project rows `A 10000`, `B 37500`, `A 15000` as distinct segments.
- Relevant lessons: keep known defaults distinct from constraints (`architecture/a-form-opens-with-the-sensible-default-already-filled-in.md`); wire every new translation key at its use (`testing/adding-an-i18n-key-you-don-t-wire-is-dead-code-that-byte-duplicates-the-inline-string.md`). The employee-create UI lesson is excluded because this change does not alter employee creation.
- Design context: preserve the existing RTL-first, dense salary tables and shared table primitives from `DESIGN.md`. The installed Impeccable product-register reference is absent; existing UI is the source of truth.
- Publication: local-only handoff. No push, PR, merge, release, package changes, children, or scope expansion.
