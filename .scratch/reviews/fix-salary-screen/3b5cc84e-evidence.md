# Green evidence — owner items 5/6/7 (HEAD `3b5cc84e`)

Base: `origin/develop` = `55b71181` (local `develop` is stale; `origin/develop`
used). Fix commit: `3b5cc84e`. Tier: Standard.

## Targeted tests (green)

```
VITEST_MAX_WORKERS=2 pnpm --filter @tuari/web exec vitest run \
  src/features/employees/add-salary-payment-dialog.test.tsx \
  src/features/app-shell/salaries-section.test.tsx
→ Test Files 2 passed (2) · Tests 30 passed (30) · exit 0
```
(log: `3b5cc84e-targeted-web.txt`)

```
VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api exec vitest run \
  src/modules/company/workforce.service-coverage.test.ts
→ Test Files 1 passed (1) · Tests 63 passed (63) · exit 0
```
(log: `3b5cc84e-targeted-api.txt`)

## Full suites

```
VITEST_MAX_WORKERS=2 pnpm test:web
→ Test Files 89 passed (89) · Tests 805 passed (805) · exit 0
```

```
VITEST_MAX_WORKERS=2 pnpm test:api
→ Test Files 1 failed | 81 passed (82) · Tests 1 failed | 1538 passed | 2 skipped (1541)
  × src/modules/auth/adapters/sqlite-bootstrap.port.test.ts >
    "propagates a cross-connection write-lock contention instead of mapping it to conflict"
    Error: Test timed out in 5000ms.
```

The one API failure is a timing-sensitive SQLite write-lock test unrelated to
this change. Re-run in isolation it passes:

```
VITEST_MAX_WORKERS=2 pnpm --filter @tuari/api exec vitest run \
  src/modules/auth/adapters/sqlite-bootstrap.port.test.ts
→ Test Files 1 passed (1) · Tests 10 passed (10) · exit 0
```

No test re-run of the full suite was made (only one full run per brief).

## Static checks

```
pnpm --filter @tuari/web typecheck   → exit 0
pnpm --filter @tuari/api typecheck   → exit 0
pnpm --filter @tuari/web lint        → exit 0
pnpm --filter @tuari/api lint        → exit 0
pnpm check:i18n-keys                 → 2/2 pass, exit 0
```

The commit's husky pre-commit ran `check:web-tracking` + `check:web-hygiene`
(9/9 pass).

## Red → green map

| Behaviour | Red at `55b71181` | Green at `3b5cc84e` |
| --- | --- | --- |
| Amount defaults to the known wage when the period is unknown | `expected '' to be '30000'` | passes |
| Amount defaults to the full salary / stays editable | already green (#420) | passes |
| Two same-month payments accepted | (no guard at base) | passes (form + service) |
| Payment history paginates | no `التالي` control | passes |
| Exactly-one-page boundary | no range text | passes |
| Shrink clamps on first render | no controls | passes |
| Search / project / period resets to page 1 | no controls | passes |
| No remaining/balance figure rendered | (regression guard) | passes |

## Not verified

- Playwright/E2E was not run (the brief allows it; ports 3000/4318 with
  `workers: 1`). The existing e2e `tests/e2e/salaries.spec.ts` still describes
  the #420 dialog behaviour and was not touched.
- Light/dark visual check was not done in a browser; only semantic tokens
  (`text-foreground`, `text-ink*`, `bg-surface*`) and the existing
  `AppShellFilterShell`/`Input`/`NativeSelect` controls are used, matching the
  #446 token set.
- The unrelated API full-suite flake above.
