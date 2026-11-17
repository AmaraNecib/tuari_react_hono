# #543 backend extraction

## Revision and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-94673631-36f45a98cb0417ea`. Base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f` (develop). Reuse source: `ec783452375bcf2c54523b830236eebb9e046738`. Verification: focused-local / CI-final-pending. Tier: high-assurance because employee authorization, money, payable posting and persistence are reachable. The parent-authorized scope and issue #543 acceptance govern; #541 checks do not prove this extraction.

## Module design

Exact employee profile/reference/history and explicit earnings are separate modules with exact string-money interfaces. Monthly approvals persist ordered earning segments and the unallocated amount as one immutable earning linked to one payable debt entry; project labor cost reads those segments rather than legacy salary cash. The normal application composition must use the configured database, shared connection FIFO, auth and finance instance. Legacy numeric salary paths remain refused in application mode.

The extraction excludes payroll cash records, opening reviews, advances, repayments, corrections, their procedures, public schemas, repositories and DDL. Keep only employee/reference/history and earning/allocation persistence. Do not add or alter migrations or issue-owned protocols. Deletion safeguards for genuine existing earnings and employee references remain. Exact UI integration is parent-owned.

## Review risk and proof

Target examples include A/B/A amounts 25,000 / 37,500 / 15,000? The approved acceptance values are A=10,000 + 15,000, B=37,500, total=62,500; A cost=25,000 and B cost=37,500. Also cover explicit zero/unallocated values, partial periods, independent edits, invalid references and amounts, duplicate request IDs, transaction rollback, and native plain/keyed persistence. Run focused contract/API tests, normal-root integration, typecheck and lint; CI-final remains pending. Architecture seam: the normal application router and contracts expose only employee operations plus approved earnings, monthly allocation and labor-cost reads.

## Lessons

Applied: employee-create UI acceptance must be checked against server role requirements and native required fields; new transaction writes must acquire the established immediate reservation; policy validation precedes expensive allocation. Excluded: UI implementation and Playwright fixture lessons, because this lane owns API/contracts only. Parent should reassess applicability against the finished source.
