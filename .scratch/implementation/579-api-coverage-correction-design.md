# API coverage correction design

## Ownership and acceptance

Worktree: `D:/worktrees/tuari_react_hono/t3-1f12a5f2-b9a24b60072688be`.
Base: `6587e466cdc5913c28777362740a0270ffb8fe6d`.
Mode: focused-local / CI-final-pending. High-assurance bounded test correction.
The parent owns combined review, publication and current-head hosted acceptance.
No production, configuration, threshold, exclusion, dependency or contract changes.

## Actual gaps and selected interfaces

Hosted run `44853685896`, job `136690792567`, passed 147 files and 2393 tests,
with one skip. Global functions were 98.86% and branches 98.5%, below 99%.
The raw hosted table is preserved in the parent's `579-hosted-6587/Test-API.log`.
Recovered the retired writer's binary diff and design without altering its tree.
Its snapshot test alone does not resolve the gap. Scoped execution confirmed
project-cost still had 88.46% functions and 80% branches with that draft present.

1. Project-cost repository read seam. Verify expense reads occur inside the
   consistent snapshot. Exercise derived-price history and unpriced inventory.
   Two thirds of a 10 DZD source in, one third out, leaves 3.33 DZD. Assert
   individual values and absence of private price-source data.
2. Company metadata facade. Preserve status filters and returned results for
   employee, project and warehouse callers. Exercise counterparty reads and
   writes through the facade rather than bypassing it with its collaborator.
3. Native exact-system-log reader. Refuse invalid row/page budgets and preserve
   empty out-of-range pagination. Attribute external debt to its counterparty
   with an exact independently entered 123.45 DZD amount, on both native drivers.
4. Payroll command interface. Reject duplicate allocations, unreconciled cash,
   absent earnings and absent advances. Refuse 10001 materialized rows from
   one cash row, 9999 allocations and one advance before financial writes.
   Assert no resulting accounts, cash or settlements. Exercise both native
   drivers. Existing money guards stay intact.

These are existing caller-facing interfaces, not newly introduced test seams.
A zero-earning candidate failed the real schema's positive-total constraint.
It was removed rather than manufacturing unreachable stored input for coverage.
A null-phone counterparty fixture also failed and was corrected to valid input.
Both failure logs remain local. These are fixture failures, not red regression
proof and not production bugs. Tests specify previously existing behavior.

## Verification and architecture

Scoped before/after JSON establishes local coverage change only. One full API
coverage run is justified and explicitly authorized because the denominator
and interaction with the global 99% gate cannot be determined from narrow
includes. Preserve its raw table, JSON and native exit, even if thresholds fail.
No second full run, web suite, browser, build or dependency audit is authorized.
Reuse matching installed parent toolchain through absent-only ignored junctions.
Native plain and encrypted fixtures run successfully with those installed bindings.
Run affected tests, package-cwd lint, API typecheck and diff checks.

Domain vocabulary remains project cost, exact source value, counterparty debt
and explicit payroll allocation. Parked inventory is not charged cost. Payroll
cash is not an earning. No vocabulary or published interface changed.
The facade delegates organizational behavior; exact money and transaction
complexity remain behind existing deep module interfaces. No new adapters or
helper seams. Architecture: no seam moved.

Applied wisdom: inspect coverage branch lists, not merely lines; avoid synthetic
paths when coverage reveals unreachable fallbacks; preserve exact split and
reversal operands rather than rounded derived rates. Adapter-exclusion layout
advice is excluded because no includes, exclusions or adapter locations change.
The single full API run at `86279521` passed 147 files, 2402 tests, with three
Windows-dependent skips. Functions improved to 99.29%, branches to 98.97%.
The global gate still failed, with 2119 of 2141 branches covered, one short.
The subsequently added payroll materialization case targets the observed
uncovered branch at payroll.service.ts:39. Only focused proof follows it.
No second full run is claimed or authorized. A fresh full gate belongs to the
parent or CI. Review and CI acceptance remain parent-owned and pending.
