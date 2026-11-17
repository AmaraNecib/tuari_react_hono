# Focused employee and payroll service tests

## Scope and verification

- Worktree: `D:/worktrees/tuari_react_hono/t3-0fd8e7df-8efeb8608b75a6e1`
- Base: `c6daf53dc0f2c643f69b67a5d4fde477695e9bc7`
- Review tier: High-assurance. Payroll cash protects money provenance; this adds tests only at the existing public service interfaces. Parent owns the required review lenses.
- Verification: `focused-local / CI-final-pending`.
- Writable paths: `apps/api/src/modules/company/employee-exact.coverage.test.ts`, `apps/api/src/modules/company/payroll-cash.coverage.test.ts`, and this design note.

## Behavior under test

`ExactEmployeeService.createEmployeesBatch` validates role assignment and worker placement before creating profiles. Tests will pin the returned validation fields and prove rejected batches create no profiles. `PayrollCashService` validates that employee and wage sources match the ledger before recording cash. Tests pin the missing-employee and wrong-employee source errors, plus unchanged cash and debt state. A real lifecycle path checks opening wage and advance balances, cash allocation, advance repayment, and corrected earnings. The advance and wage ledger-consistency guards reject corrupted persisted provenance; the SQLite adapters prevent those mutations, so tests do not manufacture corrupt rows to reach those guards.

The domain terms are employee profile, earning, payroll opening, wage allocation, advance, settlement, and cash receipt. Payroll cash remains separate from an approved earning. The tests cross the existing service interfaces and use the real SQLite adapters. No module, interface, adapter, or seam changes, so `architecture: no seam moved`.

## Test design

Use independent fixed inputs and literal expected values. Invalid employee batches must report exact field paths and leave the employee count unchanged. Payroll rejections must preserve the source balance and avoid creating cash or settlement rows. Lifecycle assertions must compare exact remaining amounts and source relationships, not restate the service's calculations.

No coverage threshold, exclusion, production source, or dependency changes. Focused coverage includes the existing service tests plus these additions. `ExactEmployeeService` reached 86.97% statements, 78.48% branches, 100% functions, and 100% lines. `PayrollCashService` reached 88.83% statements, 84.58% branches, 97.36% functions, and 100% lines. These are direct-service-test totals, not a complete-suite claim. Remaining integrity guard gaps include mismatched advance and wage ledger records. Valid app writes cannot create those states because the ledger records are immutable. Do not test them by bypassing the public service or disabling immutability.

## Wisdom

Applied `coverage-chase-exposes-latent-divergence-bugs-unify-before-covering`: inspect branches for real caller paths before adding tests. Applied `service-layer-methods-may-be-stubbed-business-rules`: confirm tested operations are implemented. Applied the SQLite semantics lesson by using SQLite adapters for these service assertions. Excluded adapter-layout and comparator-specific coverage lessons.
