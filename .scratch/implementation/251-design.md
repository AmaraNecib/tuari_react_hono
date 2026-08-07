# Issue #251 — Coverage 100%: company/debt/finance modules (high-assurance)

## Context

Parent: #248 (Coverage enforcement + failure-mode testing policy). The API vitest
config claims 100% thresholds but only enforces them on `workforce/**`, `invoice/**`
and `auth/**`. The `company` module — including the debt + finance services — is
unmeasured. Baseline (scoped run before this change):

| Metric | Company module |
|--------|---------------|
| Statements | 78.3% (1112/1420) |
| Branches | 64.48% (995/1543) |
| Functions | 80.38% (291/362) |
| Lines | 79.47% (1034/1301) |

## Tier

**High-assurance** — company/debt/finance are money-path modules per the parent
policy table (#248: "100% — high-assurance money/security paths: company (incl.
debt/finance)").

Base commit: `fd94c413846934e8722aa098f130e3a5bf9db1c6` (merge-base with
`origin/develop` at start of work).

## Decision 1 — adapter layout alignment (sqlite-company.repository.ts → adapters/)

`src/modules/company/sqlite-company.repository.ts` (844 lines) is the **only**
company storage adapter at the module root. Every sibling SQL adapter
(`sqlite-audit`, `sqlite-finance`, `sqlite-operations`, `sqlite-workforce`) and
every in-memory double lives in `modules/company/adapters/`, matching
`workforce/adapters/`, `invoice/adapters/`, and the rbac layout aligned in #209.

The parent policy explicitly excludes adapters from coverage
(`**/adapters/**/*.ts` in vitest `exclude`, "Adapters are exercised through
module tests"). Leaving this one adapter at the root would force 84 lines of
SQL-driver error-injection tests purely because of its anomalous location —
exactly what the policy's "adapters are excluded" decision avoids. Moving it
**aligns the layout with the established convention** (#209's design doc cites
`company/adapters/` as the canonical pattern) so the coverage policy applies
uniformly. The adapter remains fully exercised by the existing
`sqlite-company.repository.test.ts` and the in-memory harness tests.

Files touched by the move (import paths only, no behavior change):
- `src/modules/company/company.repository.ts` (composition root import + re-export)
- `src/config/database.ts`
- `src/modules/company/adapters/sqlite-{audit,finance,operations,workforce}.repository.ts` (type imports)
- `src/modules/company/sqlite-company.repository.test.ts` (test import)

**Not a coverage dodge**: the module's domain logic (services, helpers, mappers,
entity resolvers, system-log, composition root) is all still in scope and is
brought to an honest 100%.

## Decision 2 — test strategy

The module already has a strong suite (`company.service.test.ts`, 2145 lines,
runs against a real SQLite in-memory harness). The gaps are specific branches:

1. **Pure functions** — new `company.unit.test.ts` covering `company.helpers.ts`
   (normalizeSignedMoneyAmount happy path), `company.errors.ts` (toFailureResult
   rethrow of non-CompanyError), `company.entity-resolvers.ts` (each resolver's
   not-found/wrong-role/transition guards), `company.repository.ts`
   (`createCompanyRepository`), and `company.system-log.ts` label helpers
   (status/entryType/summary switches).
2. **Mappers** — new `company.repository-mappers.test.ts` covering every mapper
   with both null and populated nullable fields (branch coverage on the
   `row.x ? String : null` and `?? default` patterns).
3. **Finance service branches** — `createEmployeeDebtEntry` +
   `getEmployeeDebtAccount` (currently never tested), EXTERNAL_COUNTERPARTY +
   RECEIVABLE direction accounts, OPENING-after-first-entry rejection,
   recordDebtPayment/voidDebtEntry/consolidateDebtEntries error and cascade
   paths (entry-missing, non-LIVE, non-OPENING, overpayment, party mismatch,
   net remainder branches).
4. **Operations service branches** — getProject/getWarehouse happy paths,
   getProjectAssignment/getWarehouseAssignment missing, create*Assignment
   error guards, end*Assignment missing/non-active, updateProject manager
   reassignment guard.
5. **Workforce service branches** — getRole happy/not-found, role CRUD stubs
   (BUSINESS_RULE), listSalaryPayments, batch-create field errors, updateEmployee
   phone-conflict + salary guard, deleteEmployee not-found, salary payment
   missing-config guard, manager assignment missing/non-active guards,
   assignEmployeeWorkplace guards, sync guards.
6. **Facade delegation** — `company.service.ts` thin methods not yet exercised.
7. **System log filters** — actionType/actorUserId/entityId/entityType/from/to
   date filters on `buildCompanySystemLog`, plus actorLabel-cache-hit path.

## Test files (planned)

- `src/modules/company/company.unit.test.ts` (new)
- `src/modules/company/company.repository-mappers.test.ts` (new)
- `src/modules/company/company.service-coverage.test.ts` (new — facade + service branches)
- `src/modules/company/finance.service-coverage.test.ts` (new)
- `src/modules/company/operations.service-coverage.test.ts` (new)
- `src/modules/company/workforce.service-coverage.test.ts` (new)
- `src/modules/company/company.system-log.test.ts` (new)
- Extend `sqlite-company.repository.test.ts` for `createCompanyRepository` (composition root)

All tests assert behavior (result values, thrown `CompanyError` codes/messages),
never "just executes". No assertion-free tests.

## Config change

`apps/api/vitest.config.ts`:
```ts
include: [
  "src/modules/workforce/**/*.ts",
  "src/modules/invoice/**/*.ts",
  "src/modules/auth/**/*.ts",
  "src/modules/company/**/*.ts",
],
```
Thresholds stay 100/100/100/100. `**/adapters/**/*.ts`, `**/*.test.ts`,
`**/*.types.ts` remain excluded (company.types.ts and company/adapters/ excluded
by policy; company.test-helpers.ts stays in include and is already 100%).

## Risks

- **Branch-heavy services**: ~270 uncovered statements; most are single-branch
  error guards — tractable but voluminous. Mitigated by writing one focused
  test file per service.
- **Adapter move**: import-path churn in 7 files; all are compile-checked by
  `pnpm typecheck` and exercised by existing tests.
- **Threshold interactions**: other modules in `include` (workforce/invoice/auth)
  must stay at 100% — the scoped run only covers company; final run must be the
  full suite.

## Verification

- `pnpm --filter @tuari/contracts build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:api` (full suite with coverage: `pnpm --filter @tuari/api test:coverage`)
- `pnpm test:web` (untouched, but pre-push hook runs it)
