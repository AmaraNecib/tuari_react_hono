# Hosted financial E2E corrections

Worktree: D:/worktrees/tuari_react_hono/t3-cd99a433-4f7d46d126c1bf92
Base: 4f0ab4b56153fe606abb09902a177ee892ed1f7d
Mode: focused-local / CI-final-pending. High assurance, bounded E2E correction.
Parent owns independent combined-delta review, integration, publication and hosted gates.

## Source diagnosis and scope

Only i18n-raw-keys.spec.ts, salaries.spec.ts, inventory-asset-charge.spec.ts and
helpers/asset-charge.ts change. Production code and other lanes stay untouched.
The supplied design path did not exist at the assigned base, so this note
records this lane rather than overwriting another worker's note.

External details mounts ExactDebtsPage, not DebtCasesPanel. Its optional opening
is an exact decimal string and requires a reason. The global debt route also
mounts ExactDebtsPage. Create the same PAYABLE 5000.00 opening through its real
form, filter the exact party, then open its actual entry payment dialog.
Keep Arabic copy, amount/method controls and the complete raw-key scan.

SalariesSection mounts workers and earnings tabs, not the removed recent-payment
tab. Approval still uses EmployeeEarningApprovalForm and employeeEarningsApprove.
Keep 27000 acknowledgement failure and zero POST observation, plus independent
earning, segment and current cash-table observations. Keep independent 12000
segment, days 8 then 12, total 15000 and remainder 3000. Approved earnings are
not cash: assert the earned record appears and current cash remains empty.
The legacy employee_salary_payment table no longer exists.

ExactInventoryMovementForm renders an unchecked amount override and a 5000.00
purchase-source default, not a percentage editor. The original default assertion
asked only for percentage zero, equivalent to unchanged purchase cost here.
Keep its original title and default/history/project-cost checks. No scoped case
enters a nonzero percentage; #559 remains separate owner scope, not delivered.
Never infer its acceptance from these tests. Purchase uses the current exact
dialog, exact 5000.00 input and actual unit-owned project history. Read minor
units, not removed amount_dzd. Exercise the same purchased unit through exact
3500.00 override and explicit 0.00 on return, retaining all original project
charges and asserting last-charge default source. No transport mocks or numeric
fallbacks.

## Proof and architecture

The unchanged base reproduced all three hosted failures in complete three-spec
execution: 1 passed, 3 failed, 9 serial followers did not run. Subsequent complete
runs retain every original test and title. Focused local scope is these 13 tests;
full matrix, build and API coverage are not authorized. Compiler includes their
real helpers under strict Bundler settings. Use scoped ESLint and diff checks.
Final committed-head execution and fingerprints live in ignored
.scratch/reviews/579-financial. API is native authenticated managed lifecycle,
one synthetic database per spec; Chromium is installed, no downloads.

Vocabulary: opening is debt, approval is earned wage, cash is separate, project
charge is placement attribution, zero means free rather than omitted default.
Architecture: no seam moved. Helpers retain provenance, placement and cost
complexity behind existing operations rather than new production interfaces.
Applied lessons: required direction must reach wire callers; default charge
must match purchase-price source; exact fixture contracts need strict compiler.
No wisdom changes. Font allow-list warnings limit visual claims.
