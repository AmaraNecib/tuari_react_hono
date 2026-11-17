# Employee detail earnings entry

Base: `fa061534141a9588a5be0104f302aaca731ddde6`
Worktree: `D:/worktrees/tuari_react_hono/t3-2d5688df-ae4169db8744525b`
Mode: focused-local / CI-final-pending
Tier: high-assurance. The changed action reaches the approved earnings write path. Keep source totals, exact reference data, and cash history distinct.

## Decision

The employee detail page now passes the employee's optional `salaryReference` to the existing `AddSalaryPaymentDialog`. A missing reference does not prevent the user from entering an explicit earned amount. The page no longer computes a proposal, creates a numeric salary payment, or carries a numeric draft into the approval composer.

The finance summary formats DAILY references through `parseLocalizedUnitPriceInput` and MONTHLY/WEEKLY references through `formatExactMoney`. It uses `CurrencyRun`; it never converts a reference to `Number`. Null remains "not specified" and a legal zero remains visible.

The original historical cash table, including expected/actual differences and day counts, stays in place. Approved earnings use the existing `EmployeeEarningsHistory` module from imported commit `7dccf837` (source commit `fce245d3e2fe94005191417837cf09ee34a767e4`). The history section sits in the original finance tab after the earning-entry panel and before the existing historical cash table. The imported module and translation resources were not edited.

`projectAssignments` remains an optional compatibility prop because `home-view-page-content-detail-pages.tsx` still passes it. Its type comes from `@tuari/contracts`; the page does not use assignment windows to calculate money.

## Test seam and evidence boundary

The dedicated `employee-details-page.test.tsx` exercises the page action and real dialog UI. It mocks the approval mutation and history query, so it proves page wiring and the explicit-amount draft, not API persistence. The dialog's API mutation and history-query behavior remain covered by their own tests.

The original quick-save assertions were retired because their producer no longer exists. The replacement coverage checks exact DAILY display, shared dialog opening with and without a reference, explicit DZD approval without a reference, the old save action's absence, and read-only historical cash day counts.

## Verification

- Contracts build: `pnpm --filter @tuari/contracts build`, exit 0. Required to resolve the workspace package for Vitest; run through `heavy_run`.
- Focused TDD red: the new detail test failed because the exact DAILY reference was not displayed and the old numeric submit action remained.
- Focused test after implementation: `pnpm --filter @tuari/web exec vitest run src/features/employees/employee-details-page.test.tsx`, 6 tests passed in 8.28 seconds. Log: `.scratch/reviews/543-employee-detail-entry/focused-test-precommit.log`.
- Focused ESLint: `pnpm --filter @tuari/web exec eslint src/features/employees/employee-details-page.tsx src/features/employees/employee-details-page.test.tsx`, exit 0. Log: `.scratch/reviews/543-employee-detail-entry/eslint-precommit.log`.
- Web typecheck: `pnpm --filter @tuari/web typecheck`, exit 2. It reports other-consumer errors in `employees-section.tsx`, the imported salaries-section tests, `workspace-mutations.ts` and its test, `date-picker-screens.test.tsx`, and debt tests. No diagnostics point to the two authored detail files. The full diagnostic log is `.scratch/reviews/543-employee-detail-entry/web-typecheck-working-tree.log`.

## Scope boundary

No salary section, shell, shared formatter, composer, i18n, history module, or employee table source was authored here. No schema, database, recurring liability, monthly limit, proration, package, API, publication, or merge changes are part of this detail-page change. CI-final remains pending; #522 stays unchanged.
