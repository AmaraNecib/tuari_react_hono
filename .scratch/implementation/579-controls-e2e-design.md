# Hosted controls E2E correction

Base: `4f0ab4b56153fe606abb09902a177ee892ed1f7d`.
Worktree: `D:/worktrees/tuari_react_hono/t3-407d56f6-95a7142b1a9b4494`.
Mode: focused-local / CI-final-pending. High-assurance bounded E2E correction.
Parent owns independent combined-delta review, publication and hosted acceptance.

## Diagnosis and invariant mapping

The actual base browser run reproduced three failures, one pass and four serial cases not run. No production defect was established. Source and live DOM agree on these migrations:

1. `useCompositeWorkspaceQuery` calls `financialClient.metadata`, whose transport path is `/rpc/financial/metadata`. Replace the retired workspaceSnapshot response matcher with this exact path. Retain POST and HTTP 200. Mounted heading/control visibility independently proves readiness after transport success.
2. `/inventory` now mounts `ExactInventoryRoute`, initially on its stock tab. The sidebar's catalog label does not directly mount the catalog. Click the real catalog tab button before testing the unchanged catalog page. `InventoryItemDefinitionsPage` still mounts `useInventoryItemDefinitionsQuery`, using inventoryItemDefinitionsList, and the create contract still rejects name length 161 against max 160. Preserve the held real read, loading status, hidden false-empty state, injected 503 message, keyboard retry, real empty recovery and real create. Preserve the separate create HTTP 400, field-specific 160 message and absent fallback toast.
3. `/invoices/create` mounts `ExactInventoryPage` and its native purchase form. A native select cannot honestly satisfy Base UI popup geometry assertions. The live warehouse manager is `WarehouseFormFields -> CreateableSelect -> Select`, the same shared popup implementation previously exercised by the invoice. Move below-trigger placement, selected-option visibility, 900x700 collision flip, keyboard selection and twelve repeated close/label assertions to that mounted caller. Keep the original manager selection test and extend it with the real native invoice supplier's selected ID, displayed option label, readonly supplier name and persistence through debt draft changes. No production UI substitution.

`CreateableSelect` renders a clear row, four seeded managers and an inline-create row. Home establishes the clear-row starting point; three ArrowDown presses reach the independently seeded Charlie label and ID, not an expectation derived from the selected DOM. Option count remains strict at six. UUID exclusions now use the actual manager IDs rather than unrelated counterparty IDs.

The five select cases, two query-state cases and one validation case remain eight cases. Titles identify the new caller explicitly. No skips, sleeps, forced clicks, financial policy changes, contracts edits or production changes are introduced. The inherited external-environment fixture guard remains; local execution must report zero skipped.

## Scope and verification

Only the three named specs and this design note are writable source. Architecture: no seam moved. This is test navigation and caller ownership correction at existing public browser seams. Domain terminology and persistence contracts are unchanged. No adapter or interface extraction is justified.

Use the actual production Playwright/Vite configurations through ignored launch wrappers, installed Chromium and absent-only dependency junctions. Capture traces, native process exits, source/dist SHA256 fingerprints, disk and owned listeners under `.scratch/reviews/579-controls`. Run all three affected specs through heavy_run, never the full matrix. Run the scoped compiler, scoped installed ESLint and diff whitespace checks. Final execution must identify the committed HEAD. Parent review and current-head CI remain outstanding.

Applied lessons: validate the mounted path before changing validation; retained declarations do not prove active transport; full reload is readiness proof, not cache invalidation proof. Dialog draft-state guidance supports checking supplier selection survives debt disclosure. No wisdom files changed.
