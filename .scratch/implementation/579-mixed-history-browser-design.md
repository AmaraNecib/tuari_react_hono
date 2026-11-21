# Mixed-destination purchase history browser regression

Worktree: `D:/worktrees/tuari_react_hono/t3-8c86725c-5a67feea50785a8f`
Base: `7b3d5c37d70597d77878940555c1856011783bf5`
Mode: focused-local / CI-final-pending; high-assurance, narrowly affected browser proof.

## Scope and contract

Extend `tests/e2e/inventory-invoice-progressive-disclosure.spec.ts` without changing its existing six acceptance cases. Use the authenticated production editor and managed API to create one purchase with two real inventory entries: default warehouse A gets quantity 2 at 5.0000; explicit warehouse B gets quantity 4 at 5.0000. The invoice total is 30.00, with 1.00 paid and 29.00 remaining.

Assert in the global transfer history that one purchase row owns both typed warehouse links, exact per-entry quantities, and the whole-invoice amount and disclosure. Assert the purchase-summary scope notice independently. Visit both actual warehouse history tabs and prove each shows only its own item/quantity, incoming direction, whole-invoice 30.00, and the whole-invoice disclosure. Add the default-A/all-entries-B exclusion case if it fits the same isolated scenario without weakening coverage.

## Source-backed UI seams

The editor's existing real-browser coverage establishes the accessible names `الوجهة الافتراضية`, `وجهة البند`, `العنصر`, `كمية المخزون`, and `سعر الوحدة`; warehouses are selected by their actual names. `inventory-invoice-create.spec.ts` demonstrates creating definitions and warehouses and the production invoice route.

The global history renders purchase rows through `TransferHistoryItem`; its route links identify locations as `مستودع: <name>`. The summary-scope copy is `يتضمن الإجمالي مبالغ فواتير الشراء كاملة، لا قيمة أصناف الموقع فقط`. Location history rows use `location-transfer-history-row` and render direction, item name/quantity and amount. Existing `inventory-transfer.spec.ts` demonstrates actual warehouse navigation through the `سجل التحويلات` tab and row-scoped quantity assertions. Assertions must be scoped to the matching invoice/location row so unrelated rows cannot satisfy them.

## Execution boundary

The prior disk preflight measured C: free space at 203,684 KiB and D: at 4,161,564 KiB. Browser execution was initially blocked until the C: reserve was safe. The parent subsequently measured 2,307,600,384 bytes free on C and 4,251,443,200 on D and explicitly authorized the focused run. Preserve the original no-run boundary; it is no longer an active blocker. The later clearance permits only this focused browser spec. Production rebuilds, dependency installs, cleanup and shared-target writes remain excluded. The required complete-spec Chromium command remains:

`node node_modules/@playwright/test/cli.js test tests/e2e/inventory-invoice-progressive-disclosure.spec.ts --project=chromium --workers=1 --reporter=line`

The command runs through `heavy_run` with fresh D: TEMP/TMP/profile/cache/log/database/output paths and no package-manager bootstrap. An ignored runner config imports the real Playwright config and substitutes the installed native Vite entry and an owned Vite cache, without changing production source. Installed dependencies and compiled contracts are read-only inputs from the parent at the same production revision. No contracts rebuild is needed or allowed into that shared target. Final exact-head evidence remains ignored under `.scratch/reviews/579-browser-static/`.

## Implemented scenario and proof boundaries

Three new serial cases create distinct ordinary item definitions and warehouse B, save and inspect the mixed invoice, and save an all-B override invoice with default A. Existing three progressive-disclosure cases and three invoice-create acceptance cases remain unchanged. Distinct item names identify local purchase ownership without database reads or quantity-based row selection. A unique user-entered note identifies the global purchase card; per-item links and quantities are scoped within that card. Expected totals are the supplied worked example, not calculated by a production helper.

The exclusion case proves B owns both entries while A retains exactly one earlier mixed purchase and no B item. Off-page summary behavior remains covered by the parent mounted regression; this spec does not create 51 invoices. No production module, interface or domain term changes. Architecture: no seam moved. Deleting these local helpers would duplicate editor setup/navigation, not domain logic.

Applied lessons: fixture values must satisfy real contracts, lifecycle registration belongs to the spec, database ownership must be declared, and destination identity includes its warehouse type. The latter three were checked directly against managed-api, db-seed and typed form/link source; no matching dedicated wisdom file was found. No new wisdom is written by this worker. Red/green browser execution was not attempted while disk-blocked, and no red proof is claimed. Fresh source review remains parent-owned.

The first launched browser run passed the original three cases and new setup, then exposed an overbroad local selector: AppDate also renders a `bdi`. The correction selects all quantity runs by their multiplication prefix and asserts their exact ordered values separately from the exact 30.00 amount. This retains item ownership and quantity-count detection while excluding the unrelated date. Earlier startup attempts failed before tests because of wrapper cwd and Vite runner `__dirname` compatibility; their logs remain separate. No production change was required.