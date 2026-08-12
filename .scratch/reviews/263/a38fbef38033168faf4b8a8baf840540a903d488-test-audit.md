# Test Audit Evidence — Issue #263

**Head SHA**: `a38fbef38033168faf4b8a8baf840540a903d488`
**Base SHA**: `bb144f3a3a22fe5f72904aaafa511b16a9e4dec2`
**Tier**: High-assurance
**Date**: 2026-08

Three sub-agents (edge case hunter, coverage analyst, quality reviewer)
audited the changed tests: `company.role-assignability.test.ts` (new),
`company.unit.test.ts`, `company.test-helpers.ts`, `company.system-log.test.ts`
(mechanical renames), `tests/e2e/employees.spec.ts` (un-skipped + hardened).

## Findings → dispositions

| # | Finding | Risk | Disposition |
|---|---------|------|-------------|
| 1 | `updateEmployee` role-change path (accept seeded / reject non-system) untested | 🟠 | **Fixed** — added both tests |
| 2 | Mixed valid+invalid batch atomicity (persists nothing) unpinned | 🟠 | **Fixed** — added atomicity test (counts rows) |
| 3 | Padded-phone duplicate gap: single `createEmployee` duplicate guard used RAW phone while storing trimmed → padded phone could bypass the guard | 🟠 | **Fixed** — guard now uses `input.phone.trim()`; added test. (Wire schema `algerianPhoneSchema` already trims, so this was defense-in-depth, not a live prod hole.) |
| 4 | Batch with nonexistent roleId untested | 🟡 | **Fixed** — added test asserting `employees.0.roleId` field error |
| 5 | `isAcceptedEmployeeRoleKey` negative cases (unknown/empty/case) untested | 🟡 | **Fixed** — added negative test |
| 6 | isSystem gate (seeded KEY + is_system=0) unpinned | 🟡 | **Fixed** — added resolver + create tests |
| 7 | Legacy-key creation through the service (documented no-op) unpinned | 🟡 | **Fixed** — added harness-seed test |
| 8 | Empty `employees: []` batch unpinned | 🟡 | **Fixed** — added no-op test |
| 9 | Salary-pair API branches | 🟡 | Dismissed — already covered by existing `workforce.service-coverage.test.ts` ("rejects salary amount without period and period without amount") |
| 10 | E2E covers only single-create | — | Dismissed — the "create" E2E navigates to the batch page and submits via `employeesBatchCreate` (single-row batch), so the batch RPC IS exercised end-to-end |
| 11 | Duplicated custom-role SQL (4×) | — | **Fixed** — extracted `insertCustomRole` helper |
| 12 | Quality grade | — | A (reviewer); remaining nits: `not.toThrow()` accept-path assertion (adequate — `getRoleIdByKey` would throw if role missing) |

## Coverage verdict

- All acceptance criteria mapped to tests: UI create flow (E2E), role
  validation aligned with seeds (drift guards × both seed sources),
  re-enabled spec.
- 20 tests in `company.role-assignability.test.ts` (9 pre-audit + 11 added),
  all passing; full API suite 1075 passed.

## Notes

- One full-suite run failed with ~15 timeout-style failures in
  auth/recovery-key/update modules — confirmed as machine resource
  contention from parallel vitest runs in sibling worktrees
  (`issue-265`, `issue-322`); clean re-run passed 1075/1075.
