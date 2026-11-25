# Employee selector controls

- Worktree: `D:/worktrees/tuari_react_hono/t3-3419e3f4-41162b25a05d752e`
- Base: `d9510a7ec43986d825139b72d04ecf70253322d6`
- Scope: accessible role, manager and project selection in employee batch rows; no guided-tour changes and no `Closes #626` claim (the live issue is unrelated).
- Verification: `focused-local / CI-final-enforced`, per manager's current effective-rules inspection: `gh api repos/AmaraNecib/tuari_react_hono/rules/branches/develop` returned ruleset `26837184`, requiring strict `CI acceptance` from integration `15368`, PR thread resolution, no deletion and no non-fast-forward. Parent rechecks at merge.
- Tier: reversible visual-only UI with keyboard and row-isolation behavior; routine-review eligibility is not presumed because activation gates remain pending, so manager will run the three required review sessions.
- Reachable failure: a batch-row selector is unnamed, cannot be operated with keyboard, or writes a chosen manager/project into another row; RTL presentation can also misplace the selector affordance.
- Seam: `EmployeeBatchRowCard` native form controls and its `onChange(index, field, value)` interface.
- Existing proof: capture harness `tests/e2e/employee-select-capture.spec.ts`; genuine before captures at `.scratch/evidence/employee-select/before/`.
- Existing unrelated worktree changes to `playwright-report/index.html` and the untracked capture harness are preserved and will not be staged.
- Browser capture attempt: `pnpm exec playwright test tests/e2e/employee-select-capture.spec.ts` failed before reaching the employee page because `bootstrapOrSignIn` could not find `getByLabel('رقم الهاتف')` at `tests/e2e/helpers/session.ts:59`. No after images or keyboard/browser assertions were produced. Preserve this failed run; retry after investigating the auth fixture.
