# Issue #254 — Test Audit Evidence

- **Head:** `a5aee477effb935323cb32776775ef2803e91d14`
- **Base:** `origin/develop` (merge-base)
- **Tier:** Standard

3-agent audit (edge case hunter / coverage analyst / quality reviewer) ran
against the E2E spec + helpers. Grade: A-.

## Findings & dispositions

| # | Finding | Risk | Disposition |
|---|---------|------|-------------|
| 1 | E2E toast assertion could match a stale earlier toast (`.first()`), racing a delayed save → sign-out runs before the save's session re-establishment, leaving the app signed back in | 🟠 flake | **Found & fixed**: `saveAccountAndExpectSuccess` gates on the change-password response (assert 200, then toast). Validated: 5/5 + 3/3 consecutive green runs (was ~50% flaky) |
| 2 | Wrong-current-password (401) & duplicate-phone (409) branches uncovered at service level | 🟠 | **Moot**: merged #291 (closes #249) added those exact tests to `account.service.test.ts` on origin/develop |
| 3 | Repo `withTransaction` paths (rollback, nested join, lock release, missing user, passwordChanged flag) untested | 🟠 | **Moot**: merged #291 added `account.repository.test.ts` (real sqlite, raw-SQL assertions) covering all of these |
| 4 | E2E `submitSignIn` duplicated the helper's sign-in branch | 🟡 | **Addressed**: extracted `signIn` into `helpers/session.ts` |
| 5 | Toast timing coupling (`toBeHidden` waits) | 🟡 | **Addressed**: replaced with the response-gated `saveAccountAndExpectSuccess` (no dismiss-timer dependence) |
| 6 | Profile restore never asserted the form reverted to canonical values | 🟡 | **Addressed**: `expectAccountReflects` checks form values too |
| 7 | No negative-path (wrong current password) E2E coverage | 🟡 | **Addressed**: profile test asserts the inline "كلمة المرور الحالية غير صحيحة." error |
| 8 | E2E shared-DB cascade if a mid-test failure leaves credentials mutated | 🟠 | **Accepted risk**: serial mode + retries: 0 + deterministic failures (not flaky) contain the blast radius to the failing run; documented |
| 9 | Test names / async handling / isolation / comments | — | A-: no changes needed |

## Validation evidence

- `tests/e2e/admin-account.spec.ts`: 4/4 × multiple runs (incl. 5 consecutive
  post-fix runs)
- Full suite `tests/e2e`: 16 passed / 2 pre-existing skips (employees deferred)
- `pnpm typecheck`, `pnpm lint`, `pnpm test:api` (774), `pnpm test:web` (375):
  all green on the reviewed head
