# Focused employee and payroll service tests

## Scope and verification

- Worktree: `D:/worktrees/tuari_react_hono/t3-0fd8e7df-8efeb8608b75a6e1`
- Base: `c6daf53dc0f2c643f69b67a5d4fde477695e9bc7`
- Review tier: High-assurance. Payroll cash protects money provenance; this adds tests only at the existing public service interfaces. Parent owns the required review lenses.
- Verification: `focused-local / CI-final-pending`.
- Writable paths: `apps/api/src/modules/company/employee-exact.coverage.test.ts`, `apps/api/src/modules/company/payroll-cash.coverage.test.ts`, and this design note.

## Behavior under test

`ExactEmployeeService` tests cover batch role and placement validation, direct workplace assignment, manager scope, omitted placement preservation, phone conflicts and authorized role transitions. Rejected mutations assert exact error codes or field paths and unchanged profile or relationship state. `PayrollCashService` tests cover missing employees and sources, zero and reviewed opening balances, cash, both repayment source kinds, earning correction, lifecycle remaining amounts and the account-identity check.

Ledger-provenance guards also reject inconsistent reads from their repository and finance ports. Tests inject narrowly scoped mismatches at those read interfaces and assert the public service refuses them before writing. They do not alter SQLite rows or bypass immutability.

The domain terms are employee profile, earning, payroll opening, wage allocation, advance, settlement, and cash receipt. Payroll cash remains separate from an approved earning. The tests cross the existing service interfaces and use the real SQLite adapters. No module, interface, adapter, or seam changes, so `architecture: no seam moved`.

## Test design

Use independent fixed inputs and literal expected values. Invalid employee batches must report exact field paths and leave the employee count unchanged. Payroll rejections must preserve the source balance and avoid creating cash or settlement rows. Lifecycle assertions must compare exact remaining amounts and source relationships, not restate the service's calculations.

No coverage threshold, exclusion, production source, or dependency changes. Strict per-file coverage runs include each existing service test file and its new focused test file. `ExactEmployeeService` reached 100% statements, branches, functions and lines with 29 tests. `PayrollCashService` reached 100% for all four measures with 34 tests. This proves the selected service-test scope only; no full API suite ran.

## Wisdom

Applied `coverage-chase-exposes-latent-divergence-bugs-unify-before-covering`: inspect branches for real caller paths before adding tests. Applied `service-layer-methods-may-be-stubbed-business-rules`: confirm tested operations are implemented. Applied the SQLite semantics lesson by using SQLite adapters for these service assertions. Excluded adapter-layout and comparator-specific coverage lessons.
