# Test Audit — issue #30 (HEAD c558abf)
Reviewed commit range `389336a...c558abf` (fd120ca fix, 634b9f0 hardening, 26387bc fixture-enum fix).
Audit ran as 3 parallel reviewer subagents (edge-case hunter, coverage
analyst, quality reviewer) on the test files + the sources they exercise
(`inventory-invoice-details-page.tsx`, `inventory-hooks.ts`).
## Finding dispositions
| # | Finding (source) | Risk | Disposition |
| --- | --- | --- | --- |
| 1 | Fixture mock returned `data` even when the hook was disabled and lacked `refetch`; diverges from the real hook (`enabled: Boolean(invoiceId)`) | ORANGE | **Fixed** — mock now gates `data` on `invoiceId` and returns `refetch: vi.fn()` (dialog `onSuccess` path). |
| 2 | `invoiceGroupQueryState` never reset across tests (stale-state risk for future tests) | YELLOW | **Fixed** — `resetAllMutations` now clears it (symmetry with `searchState`). |
| 3 | ASSET entry branch untested (`عدد الأصول` label, asset row, ASSET movement labels) | YELLOW | **Fixed** — `makeInvoiceGroupDetail()` now includes an ASSET entry with one asset; tests assert `عدد الأصول: 1`, asset name, `شراء - مادة` movement label, `فاتورة-المورد.pdf` attachment name. |
| 4 | E2E asserted static shell chrome before the data-dependent assertion | YELLOW | **Fixed** — `itemName` (unique, data-dependent) asserted first with 15s timeout. |
| 5 | `enabled` assert tautological (derived inside the mock from the same `invoiceId`) | YELLOW | **Fixed** — dropped; `invoiceId` is the seam being tested. |
| 6 | Invalid/bad invoice id leaves the details page on an eternal "loading" state (no error surface) — pre-existing detail-page behavior, outside this issue's routing-seam scope | ORANGE | **Deferred to parent** (see report) — the debts pages have a `DebtsLoadError` pattern; invoice detail lacks one. |
| 7 | Zero-array branches (empty movements/attachments/balances) unexercised | YELLOW | Accepted — guarded by `detail &&`, schema requires arrays. |
| 8 | Test 1 and 2 render identical setups; overlapping | YELLOW | Accepted — deliberate split (render-vs-wiring seam), reviewers deemed defensible. |
## Verification
- `vitest run src/features/app-shell/home-view.test.tsx` (53 tests incl. 3 new)
  → green; full `pnpm test:web` 548 passed.
- `npx playwright test tests/e2e/inventory-invoice-create.spec.ts` → 2 passed
  with the reordered details-UI assertions.
## Grade
A- after fixes (quality reviewer baseline A-; no RED findings from any agent).
---
(`.scratch/reviews/30/`); no reviewable files changed since 634b9f0. Evidence
remains current for the final code.