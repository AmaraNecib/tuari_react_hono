# Employee edit salary reference

- Scope: `apps/web/src/features/employees/employee-edit-page.tsx` and its focused save tests. Worktree: `D:/worktrees/tuari_react_hono/t3-9118433b-26898746fe8c92ba`, branch `fix/employee-edit-salary-reference`, base `612d69040a1ced8d7a28061385f1ee7d107d1cfb`.
- Mode: `focused-local / CI-final-pending`; high assurance. CI and hosted review remain pending.
- The edit form stores `salaryReference.amount` as text and updates only when the salary controls are touched. Untouched reference state is omitted; clearing both period and amount sends `null`. Existing atomic save relationship omission remains unchanged.
- DAILY permits four fractional places; MONTHLY and legacy WEEKLY permit two. WEEKLY remains selectable only for records already stored with WEEKLY. Changing period does not convert the amount. No numeric conversion is used for salary-reference amounts.
- Validation uses existing workforce salary-reference message identifiers; `rpc-error-handling.ts` already translates those IDs and retains field paths.
- Exclusions: contracts, shared translations, app shell, other employee screens, database/data migration, package changes, publication and merge.
