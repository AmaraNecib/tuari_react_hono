# #543 backend extraction

## Revision and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-94673631-36f45a98cb0417ea`. Base: `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f` (develop). Reuse source: `ec783452375bcf2c54523b830236eebb9e046738`. Verification: focused-local / CI-final-pending. Tier: high-assurance because employee authorization, money, payable posting and persistence are reachable. The parent-authorized scope and issue #543 acceptance govern; #541 checks do not prove this extraction.

## Module design

Exact employee profile/reference/history and explicit earnings are separate modules with exact string-money interfaces. Monthly approvals persist ordered earning segments and the unallocated amount as one immutable earning linked to one payable debt entry; project labor cost reads those segments rather than legacy salary cash. The normal application composition must use the configured database, shared connection FIFO, auth and finance instance. Legacy numeric salary paths remain refused in application mode.

The extraction excludes payroll cash records, opening reviews, advances, repayments, corrections, their procedures, public schemas, repositories and DDL. Keep only employee/reference/history and earning/allocation persistence. Do not add or alter migrations or issue-owned protocols. Deletion safeguards for genuine existing earnings and employee references remain. Exact UI integration is parent-owned.

## Review risk and proof

The approved A/B/A amounts are 10,000, 37,500 and 15,000. Total earnings are 62,500; project A costs 25,000 and project B costs 37,500. Also cover explicit zero/unallocated values, partial periods, independent edits, invalid references and amounts, duplicate request IDs, transaction rollback, and native plain/keyed persistence. Run focused contract/API tests, normal-root integration, typecheck and lint; CI-final remains pending. Architecture seam: the normal application router and contracts expose only employee operations plus approved earnings, monthly allocation and labor-cost reads.

## Correction record

My initial eight-file proof omitted `exact-workforce-storage.test.ts`. Its cash fixture referenced `employee_salary_payment` tables that the narrowed schema no longer creates. This correction removes that new cash reader and public shape, replaces the cash fixture with shared-FIFO refusal coverage, and reruns the storage test. The baseline `PAYROLL_OPENING` and `PAYROLL_ADVANCE` producer values are restored unchanged; only the shared-startup comment differs from develop.

## Search correction

The exact employee adapter now matches the established literal, case-insensitive employee search semantics: first name, last name, phone, combined full name, and role display name. Both paged total and page selection use the same predicate, before pagination. Regression coverage checks combined-name and role-name results through list and paged reads.

## Employee list reads

Employee list and paged-list reads select employee IDs and exact salary references in one repository transaction. The batch reader makes one metadata query and at most two safe-integer amount queries, split by DAILY versus MONTHLY/WEEKLY units. A 120-row test checks independently expected exact references and asserts four SQL statements for the full list, five for the page, with no page-size change.

## Approval replay after actor rename

Only the exact workforce `approveEarnings` and `approveMonthlyEarnings` calls enable actor-label-insensitive replay comparison. Both are required: monthly approval checks its outer receipt before invoking child earning receipts. Stored fingerprint format and bytes remain unchanged; they record the first actor label. On a fingerprint mismatch, these calls compare the parsed existing and requested fingerprints after removing only `actorLabel`; actor user ID, producer, intent, and all other fields must still match. Replay returns stored results, so earning and ledger audit rows keep the original label. Other aggregate paths retain strict label matching. Native reopen coverage checks unchanged monthly/child and debt receipt bytes, one earning and payable per positive month, preserved audit labels, and conflicts for changed user ID or intent.

## Monthly approval replay follow-up

The first rename-replay fix covered direct `approveEarnings` receipts but missed `approveMonthlyEarnings`'s outer receipt. The monthly method now opts in at its outer aggregate as well as its child earning aggregates. Its native regression failed at the outer replay check on `8b939f66`, then passed after the correction. It checks the real two-month request, persisted reopen, unchanged monthly/child and debt receipt bytes, original audit labels, one earning/payable per positive month, and conflicts for changed actor or intent. Generic invoice aggregates still reject a changed actor label.

## Lessons

Applied: employee-create UI acceptance must be checked against server role requirements and native required fields; new transaction writes must acquire the established immediate reservation; policy validation precedes expensive allocation. Excluded: UI implementation and Playwright fixture lessons, because this lane owns API/contracts only. Parent should reassess applicability against the finished source.

## Owner-authorized API coverage policy correction

The owner approved removing mandatory coverage percentages. API coverage remains collected and reported as a diagnostic; real reachable scenarios and named test failures govern acceptance. The previous API 100% thresholds blocked CI despite the hosted suite passing 2,271 tests with two pre-existing skips, due to one uncovered reachable unknown-employee read refusal. This lane adds that public-interface regression separately. Only `apps/api/vitest.config.ts` coverage thresholds change. The CI coverage command and reports remain; no test, lint, typecheck, other CI or review/merge gate is weakened. `apps/web/vitest.config.ts` already collects reports without thresholds and remains unchanged.
