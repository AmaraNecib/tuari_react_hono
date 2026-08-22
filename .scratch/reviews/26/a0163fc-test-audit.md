# Issue #26 — Test Audit (Standard tier)

**HEAD:** `a0163fc` · **Base:** `389336a` · **Date:** 2026-08-22

Audited by a fresh-context reviewer agent against the full diff
`389336a...a0163fc` (contracts, API repos/services/migration, web feature
surfaces, fixtures) plus the design doc `.scratch/implementation/26-design.md`.

## Findings (from audit) and disposition

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P1 | `employee-edit-page.tsx` occupation field, max-120 validation and `trim() \|\| null` payload had no test | **Fixed** — added `edit-page-resync.test.tsx` case: save sends `occupation: "عامل بناء"`, 121-char value blocked with localized error and no mutation call |
| 2 | P2 | `employee-edit-page-v2.tsx` occupation input not submitted (component is unreferenced dead code; `handleSaveAll` is a pre-existing stub at base `389336a`) | **Documented** — pre-existing stub, no runtime path; UI field added for consistency per issue scope |
| 3 | P2 | Details-page `noOccupation` fallback untested | **Fixed** — `home-view.test.tsx` renders `employee-manager-1` (occupation null) and asserts "غير محدد" |
| 4 | P2 | Contracts covered only create-input occupation | **Fixed** — added update-input, batch-row (inheritance), `null`, and whitespace-only cases to `packages/contracts/src/index.test.ts` |
| 5 | P2 | Batch-create occupation path had no round-trip test | **Fixed** — `sqlite-company.repository.test.ts` batch-creation case asserts occupation persisting per row |

## Verified coverage (no gaps)

- Mapper trim + null handling (`company.repository-mappers.test.ts`).
- SQLite single create / update / null-clear round trips.
- Deep module create / update / clear incl. `findById` re-read
  (`employee.module.test.ts`).
- Batch draft trim→undefined, empty-draft absence, 121-char rejection
  (`employee-batch-schema.test.ts`).
- `buildEmployeeRow` occupation passthrough (`?? null`).
- Label rename reflected in tests (`home-view.test.tsx` uses
  "صلاحية التطبيق").
- DB: fresh-schema CREATE, additive `ALTER TABLE`, drizzle schema, and the
  `employee_checked` rebuild mirror all include `occupation` (nullable, no
  CHECK — per design).
- `normalizeText` empty→null guard already covered generically.

## Commands

- `pnpm --filter @tuari/contracts test` — 162 passed
- `pnpm test:api` — 1254 passed, 1 skipped
- `pnpm test:web` — 549 passed (full suite; the one flaky pair — home-view
  heading wait + prod-html build timeout — passed on re-run and is a
  known full-suite-load flake per `.agents/wisdom/testing.md`)

No Playwright this round (lane #30 owns E2E; CI runs full e2e after merge).