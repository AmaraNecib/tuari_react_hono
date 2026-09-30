# Green evidence — salary screen items 5/6/7 + save reasons (HEAD `614723e6`)

Base: `origin/develop` = `55b71181` (local `develop` stale; `origin/develop`
used). Fix SHA: `614723e6`. Tier: Standard.

Supersedes `ca739e74-evidence.md`; the SHA moved again for the parent-requested
missing-wage save reason and the design-pass fixes. The branch is intentionally
left unrebased so these SHAs stay valid; the parent rebases at integration.
Design pass: `design-pass.md`.

## Targeted tests (green)

```
VITEST_MAX_WORKERS=2 pnpm --filter @tuari/web exec vitest run \
  src/features/employees/add-salary-payment-dialog.test.tsx \
  src/features/app-shell/salaries-section.test.tsx \
  src/features/employees/salary-payment-form.test.ts
→ Test Files 3 passed (3) · Tests 53 passed (53) · exit 0
```
(the salary-payment-form test is included because the design pass changed its
`defaultSalaryPaymentDays`), log: `614723e6-targeted-web.txt`.

```
VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api exec vitest run \
  src/modules/company/workforce.service-coverage.test.ts
→ Test Files 1 passed (1) · Tests 63 passed (63) · exit 0
```
(log: `614723e6-targeted-api.txt`)

## Static checks

```
pnpm --filter @tuari/web typecheck   → exit 0
pnpm --filter @tuari/web lint        → exit 0
pnpm check:i18n-keys                 → exit 0
```
Commit pre-commit ran `check:web-tracking` + `check:web-hygiene` (9/9 pass).

## Full suites (run once, before the follow-ups)

```
VITEST_MAX_WORKERS=2 pnpm test:web   → 89 files / 805 tests passed, exit 0
VITEST_MAX_WORKERS=2 pnpm test:api   → 1538 passed / 2 skipped;
  1 unrelated flake: src/modules/auth/adapters/sqlite-bootstrap.port.test.ts
  write-lock timeout (passes 10/10 in isolation), exit 1
```
The follow-ups touch the dialog, `salaries-section`, `ar.ts` and the shared
`salary-payment-form` helper; the full suites were not re-run (brief: one full
run at most).

## Red → green map

| Behaviour | Red | Green at `614723e6` |
| --- | --- | --- |
| Amount defaults to the known wage when the period is unknown | `expected '' to be '30000'` at `55b71181` | passes |
| Save blocked with reason when the period is unknown | `expected false to be true` on the disabled assertion (pre-guard dialog) | passes |
| Save blocked with reason when the wage is missing, even after an amount is typed | `expected false to be true` on the disabled assertion (pre-guard dialog) | passes |
| Known wage + period shows no reason and a live save | (new assertion) | passes |
| Full-salary default / editable | already green (#420) | passes |
| Two same-month payments accepted | (no guard at base) | passes (form + service) |
| Pagination boundary / shrink / search-filter reset | no controls | passes |
| No remaining/balance figure rendered | (regression guard) | passes |

Both visibility red proofs were taken by stashing only
`add-salary-payment-dialog.tsx` (keeping the new assertions in place) and running
the relevant test: `AssertionError: expected false to be true` on
`expect(submit.hasAttribute("disabled")).toBe(true)`.

## Design pass

`design-pass.md` records the three-lens result on the whole diff. Two in-scope
findings were fixed here: the duplicated "unknown period means a month" rule
(now `effectiveSalaryPeriod`) and the shallow `SalaryFilterField` copy (now the
existing `Field` primitive). The rest are recorded as follow-ups / justified
as-is.

## Not verified

- Playwright/E2E not run.
- Light/dark visual check not done in a browser; only semantic tokens
  (`text-destructive`, `text-foreground`, `text-ink*`, `bg-surface*`) and
  existing controls are used.
- The unrelated API full-suite flake above.
- Branch is behind the advanced `origin/develop`; parent rebases at integration.
