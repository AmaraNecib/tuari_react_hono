# Green evidence — owner items 5/6/7 + period visibility (HEAD `ca739e74`)

Base: `origin/develop` = `55b71181` (local `develop` is stale; `origin/develop`
used). Fix SHA: `ca739e74`. Tier: Standard.

Supersedes `3b5cc84e-evidence.md`; the SHA changed after the period-visibility
follow-up the parent requested. The branch is intentionally left unrebased so
these SHAs stay valid; the parent rebases at integration.

## Targeted tests (green)

```
VITEST_MAX_WORKERS=2 pnpm --filter @tuari/web exec vitest run \
  src/features/employees/add-salary-payment-dialog.test.tsx \
  src/features/app-shell/salaries-section.test.tsx
→ Test Files 2 passed (2) · Tests 30 passed (30) · exit 0
```
(log: `ca739e74-targeted-web.txt`)

```
VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api exec vitest run \
  src/modules/company/workforce.service-coverage.test.ts
→ Test Files 1 passed (1) · Tests 63 passed (63) · exit 0
```
(log: `ca739e74-targeted-api.txt`)

## Static checks

```
pnpm --filter @tuari/web typecheck   → exit 0
pnpm --filter @tuari/web lint        → exit 0
pnpm check:i18n-keys                 → 2/2 pass, exit 0
```
The API package was not re-run this round (only Arabic web files and the web
dialog changed). The commit's husky pre-commit ran `check:web-tracking` +
`check:web-hygiene` (9/9 pass).

## Full suites (run once, before the visibility follow-up)

```
VITEST_MAX_WORKERS=2 pnpm test:web   → 89 files / 805 tests passed, exit 0
VITEST_MAX_WORKERS=2 pnpm test:api   → 1538 passed / 2 skipped;
  1 unrelated flake: src/modules/auth/adapters/sqlite-bootstrap.port.test.ts
  write-lock timeout (passes 10/10 in isolation), exit 1
```
The visibility follow-up touches only the dialog, its test and `ar.ts`, so the
full suites were not re-run (brief: one full run at most).

## Red → green map

| Behaviour | Red | Green at `ca739e74` |
| --- | --- | --- |
| Amount defaults to the known wage when the period is unknown | `expected '' to be '30000'` at `55b71181` | passes |
| Save blocked with reason when the period is unknown | `expected false to be true` on the disabled assertion (pre-guard dialog) | passes |
| Known period shows no reason and a live save | (n/a; new assertion) | passes |
| Amount defaults to the full salary / stays editable | already green (#420) | passes |
| Two same-month payments accepted | (no guard at base) | passes (form + service) |
| Payment history paginates / boundary / shrink / reset | no controls | passes |
| No remaining/balance figure rendered | (regression guard) | passes |

The visibility red proof was taken by stashing only
`add-salary-payment-dialog.tsx` (leaving the new test assertions in place) and
running the unknown-period test: `AssertionError: expected false to be true`
at `expect(submit.hasAttribute("disabled")).toBe(true)`.

## Not verified

- Playwright/E2E was not run.
- Light/dark visual check was not done in a browser; only semantic tokens
  (`text-destructive`, `text-foreground`, `text-ink*`, `bg-surface*`) and the
  existing controls are used, matching the #446 token set.
- The unrelated API full-suite flake above.
- Branch is behind the advanced `origin/develop` (`2cfc5fc3`, #445); no file
  overlap, parent rebases and re-runs at integration.
