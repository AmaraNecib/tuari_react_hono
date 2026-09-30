# PR #422 round 7 — code review (Standards + Spec)

reviewed HEAD: 25c60c71
fix commit: 20cfdd30a6b8a0eda33c3eba94442df326712d3d
base: origin/develop
spec: .scratch/implementation/413-design.md

Two fresh-context reviewers, one per axis.

## Standards

- **Money rendering (fixed).** `.agents/wisdom/testing.md` requires
  `toLocaleString("ar-DZ")`. `AssetChargeHistory` and the dialog price hint
  printed raw numbers; both now format, pinned by tests that fail pre-fix.
- **Playwright coverage (fixed).** `docs/engineering-workflow.md` requires an
  E2E test for a user-facing feature. Added
  `tests/e2e/inventory-asset-charge.spec.ts`; 4/4 pass locally.
- **Duplicated `roundMoney` (fixed).** Moved to `@tuari/contracts` beside
  `MAX_MONEY_DZD`; the API helper re-exports it and the web dialog imports it.
- **Em dashes in comments (dismissed).** `origin/develop` uses `—` in JSDoc
  throughout; `check:unslop` scans markdown only.
- **Coverage include omits `modules/inventory/**` (reported).** Pre-existing
  config gap; scoped coverage over `asset-charge.service.ts` is 100%.
- **Middle-man delegators / bulk-vs-single gate (reported).** The bulk path now
  shares the one `sumLiveCharges` and the read order; the delegators are thin
  by design.

## Spec

- **Spec (a)/(b): no missing requirement and no unsanctioned scope creep.** The
  invoice-details rewrite, the `roundMoney` overflow guard and the
  `queryAuth(errorResolver)` are all recorded in the design.
- **Spec (c): one wrong claim, disproven.** The reviewer reported that a
  header-level project destination books no charge. The loop uses
  `preparedEntries`' resolved `projectId` (`effectiveProjectId`), so the
  header-inherited project IS charged. Added a regression test.
- **Note (reported):** `getLastChargeAmount` filters `status='LIVE'`, so a voided
  last charge falls back to the purchase price. Defensible and now pinned by a
  test.
- **Note (fixed):** `getAsset`'s optional charge read is deliberately tolerant
  (see debate dismissals).

## Summary

Standards: 5 findings (4 fixed, 1 dismissed with evidence) plus 2 reported.
Spec: 1 finding, dismissed with code evidence and now pinned; 2 notes.
