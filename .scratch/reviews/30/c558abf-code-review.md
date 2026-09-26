# Code Review — issue #30 (HEAD c558abf)

Reviewed `git diff 389336a...c558abf` (fd120ca, 634b9f0, 26387bc) along two
axes in parallel reviewer sub-agents. Spec source: crew brief for #30 +
`.scratch/implementation/30-design.md`. Standards sources: AGENTS.md,
`docs/engineering-workflow.md`, `.agents/wisdom/*.md`.

## Standards

Verified correct:
- `home-view.tsx` — minimal one-line `invoiceId` forwarding; prop already
  existed downstream. No Mysterious Name / Duplicated Code / Feature Envy.
- `home-view-page-content-detail-pages.tsx` — `: null` → `MissingRecordState`
  structurally identical to the 8 sibling detail-page fallbacks.
- Tests use `findBy*` for lazy/Suspense content (wisdom testing.md), unique
  E2E seed names (wisdom testing.md), and the diff stages only the allowed
  design doc under `.scratch/` (AGENTS.md staging rule).

Judgement calls (no hard documented violations; no blockers):
- Hardcoded Arabic title `"تفاصيل الفاتورة"` in the new fallback vs i18n-key
  titles on siblings. Precedent exists (`external-details` uses a hardcoded
  `"ملف الطرف الخارجي"`); `detailPages` copy has no invoice key; the design
  doc chose this explicitly. Accepted.
- `invoiceGroupQueryState` mirrors the `searchState` slot pattern (designed
  duplication; reviewers accepted after the reset fix).
- `invoiceId` drilling (HomeView → PageContent → DetailContent) is the
  documented home-view seam, not a Message Chain smell.

Standards findings: 0 hard violations, 0 actionable.

## Spec

Verified against brief + design doc:
- Seam complete end-to-end: `router.tsx` → `HomeView invoiceId` →
  `HomeViewPageContent` → `selectedInvoiceId` → `case "invoice-details"`
  renders `InventoryInvoiceDetailsPage` (mounts `useInventoryInvoiceGroupQuery`
  → `inventoryInvoiceGroupsGet`). ✅
- Id-less route no longer renders an empty main; falls back to
  `MissingRecordState` navigating to `/invoices`. ✅
- No parallel RPC surface; API and details page untouched. ✅
- Unit tests assert query wiring (`invoiceId="invoice-1"`) + rendered details;
  E2E asserts the created invoice renders; DB-seam assertions kept. ✅
- Design doc promised "a reset for the query state" — added in commit 634b9f0
  (`resetAllMutations`). ✅

Spec findings: 0 missing, 0 scope creep, 0 wrong implementations. (One
accepted note: id-present-but-data-undefined loading branch is out of scope,
mirrors finding #6 of the test audit.)

## Summary

Standards: 0 findings (worst: none). Spec: 0 findings (worst: none). Both axes
clean; the only open item is the pre-existing details-page error surface,
deferred to the parent.


(`.scratch/reviews/30/`); no reviewable files changed since 634b9f0. Evidence
remains current for the final code.