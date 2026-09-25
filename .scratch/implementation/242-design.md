# Issue #242 — Reports: stop stubbing what the dashboard renders

- **Mode:** local-only (offline repo; no gh/PR/push/fetch per lane authority + AGENTS.md)
- **Ticket source:** `docs/local-issue-snapshot.json` (#242, body empty) / `docs/local-issue-status.md` — parent/map context #235, no issue-specific local evidence (fresh lane)
- **Branch:** `feature/issue-242-real-reports`
- **Fixed base SHA:** `6be3497` = current HEAD = lane authority `origin/develop @ 6be3497`.
  Note: the local `develop` ref resolves to `bb144f3` (an ancestor of HEAD); the lane brief pins `6be3497`, so all diffs are against `6be3497` (empty worktree diff at start).
- **Review tier:** High-assurance (financial aggregations: debt/inventory/movement sums) — Standard gates + debate.

## Problem

`apps/api/src/rpc/handlers/reports.ts` generates the three report types rendered by
`apps/web/src/features/dashboard/dashboard-overview.tsx` and
`apps/web/src/features/reports/report-builder.tsx` (via
`apps/web/src/hooks/use-report-queries.ts` → `rpcClient.reportsGenerate`):

- **INVENTORY** — `totalAssetsDzd`/`totalConsumablesDzd`/`byLocation`/`byItemType`/`agingAnalysis`
  are hardcoded zeros; only `totalValueDzd` is computed (sum of `grossTotalDzd` of invoice groups,
  date-filtered client-side on `invoiceDate`). The dashboard renders `totalValueDzd` and
  `totalAssetsDzd` as live metrics.
- **DEBT** — every field is zeroed; `startDate`/`endDate` are `void`-ed.
- **MOVEMENT** — every field is zeroed; `startDate`/`endDate`/`inventoryService` are `void`-ed.

The historical commit (`62a9141`) fabricated splits (`0.6/0.4`) and fake counts; `80d4926`
removed the fabrication and left zeroed stubs. This lane replaces the remaining stubs with
real aggregations, with honest, documented semantics.

## Key constraints discovered by inspection

- Wire contract (`packages/contracts/src/reports.ts` + `reports-contract.ts`) is fixed: output
  schemas require non-negative numbers and `timestampSchema` (ISO-8601 with offset) dates. We do
  **not** change the contract; we fill it honestly.
- The dashboard never passes dates (`useInventoryReport()` / `useDebtReport()`); the
  report builder passes optional `startDate`/`endDate` (ISO datetime strings, validated by
  `reportFilterInputSchema`). Empty ranges must yield an all-zeros-but-valid report.
- Only one persistence implementation exists per port: `DrizzleInventoryRepository`
  (`adapters/sqlite-inventory.repository.ts`) and `FinanceRepository`
  (`adapters/sqlite-company.repository.ts` via `SqliteCompanyRepository`). There is no in-memory
  inventory adapter — integration tests use a real in-memory SQLite DB (`:memory:`) with the full
  schema (`infrastructure/database/schema-definitions.ts` + `ensureDatabaseSchema` for the
  OUTBOUND_SALE movement CHECK migration).
- `inventory_movement` rows carry no monetary value; value must be joined from
  `inventory_entry.unit_price_dzd` (entries store unit price + totals; assets store
  `purchasePriceDzd` per unit, entries store `totalPriceDzd`).
- Debt semantics: `debt_account` stores *positive* `currentBalance` + `direction`
  (PAYABLE/RECEIVABLE) + `status` (OPEN/SETTLED); LIVE entries carry `signedAmountDzd` and
  `entryDate`. The net-perspective sign convention lives in `@tuari/contracts`
  `getDebtAccountNetContribution`/`getNetDebtBalance` (do not re-derive sign logic in the report).
- No "due date" exists in the debt schema, so "overdue" is defined operationally below and
  documented — no fabricated dates.

## Chosen aggregation seams (smallest, service-level)

The reports are read-only projections. The RPC handler stays a thin dispatcher; real logic lives
at the **service** boundary (deep module owns its domain), reading through the existing
repository ports. Two new repository reads + one label resolver are added (bulk reads belong at
the repository seam; they are single-query and avoid N+1 loops).

### InventoryRepository additions (`inventory.repository.ts` interface + sqlite adapter)

```ts
/** Flat valuation row for the INVENTORY report — entry joined with its invoice-group date and resolved location label. */
listInventoryValuations(): InventoryValuationRow[]

/** Movement rows joined with the unit price of the linked entry (null when no entry link exists). */
listMovementValuations(): InventoryMovementValuationRow[]

/** Stable Arabic location label for a warehouse/project id pair (reuses resolveLocationLabelByIds). */
resolveLocationLabel(warehouseId?: string | null, projectId?: string | null): string
```

with new DTO types in `inventory.types.ts`:
- `InventoryValuationRow { id, itemType, itemName, quantity, unitPriceDzd, totalPriceDzd, lastUpdated, documentDate, locationId, locationLabel }`
  — `documentDate = invoice_group.invoice_date ?? invoice_group.created_at` (window + aging basis).
- `InventoryMovementValuationRow { movement: InventoryMovementRecord, unitPriceDzd: number | null }`

### Service methods (real aggregation)

`InventoryService.generateInventoryReport(input: { startDate?: string; endDate?: string })` → `InventoryReport`

- Window = `[Date.parse(startDate) ?? -∞, Date.parse(endDate) ?? +∞]`, applied on `documentDate`.
- `summary.totalAssetsDzd` = Σ `totalPriceDzd` of ASSET rows in window; `totalConsumablesDzd` =
  Σ CONSUMABLE rows; `totalValueDzd` = sum. (Directly what the current stub approximated by summing
  invoice-group gross totals — now split honestly by item type from entry data.)
- `byLocation`: one row per distinct location, grouped by a location-kind-qualified
  key (warehouse vs project ids live in separate namespaces, so a warehouse and
  a project can share an id string). Each row emits the single nullable
  `locationId` + `locationLabel` from `resolveLocationLabel` (a null location
  collapses into one "غير محدد" bucket); `assetCount`/`consumableCount`
  = Σ quantities per item type; `assetValueDzd` = Σ asset totals per location.
- `byItemType`: one row per `itemName` (the only key the contract's byItemType
  shape offers — it has no item id); quantity = Σ quantities, valueDzd = Σ totals,
  `lastUpdated` = max `updatedAt`.
- `agingAnalysis`: age = whole days from `documentDate` to the report date
  (`Date.parse(endDate) ?? now`), clamped ≥ 0; buckets `0-30_DAYS`, `31-90_DAYS`,
  `90-180_DAYS`, `180+_DAYS`; `count` = number of line items in bucket, `valueDzd` = Σ totals.
- Monetary sums rounded to 2 decimals (`roundMoney`). `roundMoney`, `MS_PER_DAY`,
  `resolveReportWindow` and `ageInDays` live once in
  `apps/api/src/modules/company/report.helpers.ts`, shared by both services so
  the rounding/aging rules cannot drift.

`InventoryService.generateMovementReport(input: { startDate?: string; endDate?: string })` → `MovementReport`

- Window on `movement.occurredAt`.
- `summary`: `totalMovements` = count; `assetTransfers`/`consumableTransfers` = TRANSFER
  movements split by item type; `outboundSales` = OUTBOUND_SALE count.
- `byType`: for PURCHASE/TRANSFER/OUTBOUND_SALE — count + value = Σ (`quantity × unitPriceDzd`),
  unit price from the linked entry (0 when the movement has no entry link — assets sold outbound
  do not carry an entry link at the movement level, so their value is honestly 0; documented).
- `byPeriod`: group by `YYYY-MM` prefix of `occurredAt`.
- `topDestinations`: movements with a destination (`toWarehouseId`/`toProjectId` — PURCHASE +
  TRANSFER), grouped by destination, labeled via `resolveLocationLabel`, sorted by receive count
  desc, capped at 10.

`FinanceService.generateDebtReport(input: { startDate?: string; endDate?: string })` → `DebtReport`

- Reads all accounts, all LIVE entries (grouped per account via `listAllDebtEntries`), and party
  name maps (same employees/counterparties maps `listDebtsSummary` builds).
- **Participation rule (documented):** an account participates iff it has at least one LIVE entry
  whose `entryDate` falls inside the window. Unbounded window sides are open. This makes date
  filters real without pretending historic balances are reconstructible. Account balances are
  CURRENT (as-of-now); `endDate` is a participation + aging reference, not a balance snapshot
  (as-of-historic reconstruction is explicitly deferred).
- `summary`: `totalOutstandingDzd` = Σ `currentBalance` over OPEN participating accounts;
  `totalSettledDzd` = Σ |signedAmountDzd| over LIVE SETTLEMENT entries of SETTLED participating
  accounts; `overdueDzd` = Σ `currentBalance` of OPEN participating accounts aged ≥ 60 days
  (age = days from the account's OLDEST live entry to the report date); `partyCount` = distinct
  parties (worker or external counterparty).
  **Direction semantics (documented):** outstanding/overdue/aging are GROSS open balances across
  BOTH PAYABLE and RECEIVABLE directions (exposure magnitude, always non-negative). The net sign
  convention lives in `getDebtAccountNetContribution`/`getNetDebtBalance`; this report does not net
  directions because the contract's non-negative schema cannot represent a net that goes negative.
  Pinned by a dedicated test.
- `agingBreakdown`: OPEN participating accounts bucketed by the same age: `0-30_DAYS`,
  `31-60_DAYS`, `60+_DAYS`; `countOpen` + `amountDzd` per bucket.
- `byParty`: one row per distinct party — `partyId` (workerId ?? externalCounterpartyId),
  `partyName`, `partyType`, `outstandingDzd`, `settledDzd`, `lastTransaction` = latest LIVE entry
  date across the party's participating accounts.
- `topDebtors`: parties with `outstandingDzd > 0`, sorted desc, capped at 10;
  `amountDzd` = party outstanding; `daysSinceLastPayment` = whole days from the party's latest
  LIVE PAYMENT entry to the report date, clamped ≥ 0; when no payment exists it falls back to
  days since the latest LIVE entry (any type) — documented proxy, still a measured value, never
  a fabricated payment date.

### Handler + router

- `createReportsHandlers(os, m, financeService, inventoryService)` — DEBT now delegates to
  `FinanceService` (the deep module owning debt; `CompanyService` only forwards) instead of
  `CompanyService`. Router passes `dependencies.financeService`
  (`RouterDependencies` already carries it).
- Handler is a thin dispatcher returning the service-produced contract-typed reports
  (type literal + `generatedAt` via `createAlgeriaTimestamp()`).

## Files touched

- `packages/contracts` — **no changes** (contract fixed; verified reachable and already tested).
- `apps/api/src/modules/inventory/inventory.types.ts` — new DTO types.
- `apps/api/src/modules/inventory/inventory.repository.ts` — interface additions (2 reads + label resolver).
- `apps/api/src/modules/inventory/adapters/sqlite-inventory.repository.ts` — implementations.
- `apps/api/src/modules/inventory/inventory.service.ts` — `generateInventoryReport`,
  `generateMovementReport`.
- `apps/api/src/modules/company/finance.service.ts` — `generateDebtReport`.
- `apps/api/src/modules/company/report.helpers.ts` — NEW shared report helpers
  (`roundMoney`, `MS_PER_DAY`, `resolveReportWindow`, `ageInDays`).
- `apps/api/src/rpc/handlers/reports.ts` — thin dispatcher over the three service methods.
- `apps/api/src/rpc/router.ts` — pass `financeService`.
- `apps/api/src/rpc/router.test.ts` — wire a real `InventoryService` over a legacy-schema
  in-memory DB (empty ⇒ existing zero assertions stay green).
- `apps/api/src/rpc/handlers/reports.test.ts` — NEW end-to-end report tests through the RPC
  client with seeded real data (see below).
- `.scratch/implementation/242-design.md` — this file.
- `.scratch/reviews/242/` — guard/test-audit/code-review/debate/greptile evidence at final HEAD.

## Planned tests (TDD at the integration seam)

`apps/api/src/rpc/handlers/reports.test.ts` (new): full in-memory DB via
`ensureDatabaseSchema(BetterSqlite3Executor)`; real `SqliteCompanyRepository`,
`createInventoryRepository`, `InventoryService`, `FinanceService`, router built like
`router.test.ts`; drive through `createRouterClient`.

- **DEBT:** seed external counterparty + employee → debt accounts (OPEN with opening balances,
  one SETTLED via `settleDebtAccount`, payments via `recordDebtPayment`/`createDebtEntry`).
  - totalOutstanding/settled/partyCount match seeded sums; aging buckets; byParty rows;
    topDebtors ordering + daysSinceLastPayment; empty window → all-zero valid report;
    date-window only includes accounts active in range.
- **INVENTORY:** seed warehouses/projects, item definitions, invoice groups (consumable + asset
  entries with distinct `invoiceDate`s). Assert totalAssets/totalConsumables/totalValue,
  byLocation (label + counts + values), byItemType (grouping by item name), aging buckets;
  date window selects receipts inside range; empty window → zeros.
- **MOVEMENT:** seed purchases + transfers (+ one outbound sale of a consumable with
  `createOutboundTransfer`). Assert summary counts, byType counts/values, byPeriod month groups,
  topDestinations; date window on `occurredAt`; empty window → zeros.
- Regression: existing `router.test.ts` wiring tests for the three types stay green (empty data).

Existing zero-summary assertions in `router.test.ts` intentionally remain — they now assert
honest empty-state zeros rather than stub-shaped data.

## Semantics documented (not invented requirements)

- "Overdue" has no due date in the domain; defined as OPEN balance aged ≥ 60 days (the `60+_DAYS`
  bucket). Written into the service JSDoc.
- Movement value uses the linked entry's unit price; asset outbound sales (no entry link on the
  movement) contribute value 0 rather than a fabricated estimate.
- Debt date window selects accounts *active* in the window (LIVE entry in range); balances are
  point-in-time as of now/endDate. Historic balance reconstruction is out of scope (deferred).
- Counts are integers by construction.

## Risks / migration

- No schema/contract changes → no migrations. No remote operations.
- `router.test.ts` gains a real inventory service; the legacy-schema DB there lacks the
  OUTBOUND_SALE CHECK migration, but the wiring tests insert no data, so it is irrelevant there;
  the full-schema `ensureDatabaseSchema` path covers OUTBOUND_SALE in `reports.test.ts`.
- Report reads scan full tables (invoice entries/movements/debt) — acceptable for a local
  single-user SQLite app; documented as the intended read-only seam.
- Deferred (documented, not deep-scoped): as-of-historic debt balances, per-unit asset valuation
  on movement value, movement value for asset outbound sales, dashboard "reports" quick-actions
  (unrouted buttons) — all outside the issue.

## Local check plan

`pnpm --filter @tuari/contracts build` (verify untouched), `pnpm typecheck`, `pnpm lint`,
`pnpm --filter @tuari/api test`, `pnpm --filter @tuari/web test` (web unaffected — hooks/report
page unchanged), then `greptile review --json --branch origin/develop` with issue-scoped
instructions per the lane brief.
## Coverage completion (test-only lane, PR #10)

Added honest branch-cover fixtures in
`apps/api/src/modules/company/finance.service-coverage.test.ts` for the three report
aggregation branches the CI coverage gate surfaced:

- partyName fallback to `account.id` when neither employee nor counterparty resolves
  (orphaned worker reference via FK-off UPDATE).
- `lastTransaction` keeps `previous` when a same-party second account's latest entry is
  not strictly newer (two ledgers for one counterparty, equal opening dates).
- top-debtors/byParty sort tie broken by `localeCompare(..., "ar")` (two parties with
  equal outstanding amounts).

Final coverage: statements/functions/lines 100%; branches 99.75% (1221/1224). The
remaining three branch edges are genuinely unreachable through valid states and were
intentionally NOT forced or excluded from coverage (no config weakening, no v8-ignore):

- L936 `liveEntriesByAccount.get(account.id) ?? []` in the aggregation loop: the loop
  only visits `includedAccounts`, which the same map's `.some(...)` filter guarantees has
  ≥1 live entry, so `.get()` can never miss.
- L968 `[0]?.entryDate ?? ""`: the entries array is non-empty by the same invariant and
  `entry_date` is `NOT NULL` in the schema.
- L981 `partyId: workerId ?? externalCounterpartyId ?? account.id`: the debt_account
  CHECK constraint enforces exactly one of the two party refs, so both-null — the only
  state that reaches the account.id fallback — cannot exist (even the orphan tests keep
  the ref non-null).

## Coverage completion (follow-up: parent-approved v8-ignore)

Parent approved Option 1 for PR #10: mark the three provably-unreachable defensive
fallback branch edges in `generateDebtReport` with `v8 ignore` pragmas so the global
100% branch threshold is met without weakening the coverage config.

Final coverage: statements/functions/lines/branches all 100% (1434/1434 stmts,
1217/1217 branches, 358/358 funcs, 1393/1393 lines) on the nodes used by CI.

Implementation note: the `/* v8 ignore next */` form only takes effect when the next
AST node's start offset exactly matches the hint's end; in practice it works for object
properties but NOT for `const x = ... ?? ...` declarations in this pipeline (verified
with a throwaway vitest repro). The line-range form `/* v8 ignore start */` /
`/* v8 ignore stop */` is reliable for all three statements and is what the service uses.

The pragmas annotate only statements whose branches are unreachable through valid
states (documented in the preceding section).

## Greptile P1 (verified TRUE): asset transfer valuation uses entry average, not asset purchase price

Greptile claimed inventory.service.ts:1091 valued asset TRANSFER movements at the entry's
AVERAGE unitPriceDzd instead of the transferred asset's purchasePriceDzd, so transfer/
period/destination totals are wrong when one entry holds assets at differing prices.

Verified against the data model:
- Asset entries store `unit_price_dzd = totalPriceDzd / quantity` (an average across the
  entry's assets); each asset unit (`inventory_asset_unit`) keeps its own
  `purchase_price_dzd`.
- `listMovementValuations` (sqlite-inventory.repository.ts) joined only `inventory_entry`
  and valued every movement at the entry's average price.
- A TRANSFER movement links the specific asset (`asset_unit_id`) AND the parent entry, but
  quantity is 1; when the entry holds two assets at 1M and 3M (avg 2M), transferring the
  cheaper asset was valued at 2M instead of its purchase price of 1M.

Fix: left-join `inventory_asset_unit` on `asset_unit_id` and prefer the asset's own
`purchase_price_dzd` when the movement moves a specific asset unit; consumables (no asset
link) still fall back to the entry's unit price, and outbound asset sales (no entry link)
stay honestly 0. Added a focused RPC test (reports.test.ts) seeding one entry with assets at
1M + 3M, transferring the 1M asset, asserting TRANSFER value 1M and May-period/destination
totals — the test failed at 2M before the fix (proving the claim TRUE) and passes after.
Coverage remains 100% statements/functions/lines/branches.
