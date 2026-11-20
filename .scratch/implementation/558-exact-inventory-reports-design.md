# Exact inventory and movement readers

Base: c428d3abb48c86c7e18c206eaada40990900221c.
Tree: D:/worktrees/tuari_react_hono/t3-43837074-3efb26e978cf705f.
Mode: focused-local / CI-final-pending. High-assurance because source valuation,
wide aggregates, stock and date boundaries can produce reachable monetary errors.
Local-only implementation lane. Parent owns independent review, mounting and publication.

## Interface and source authority

`new ExactInventoryReportSource(db, sharedFifo, rowLimit?)` supplies a native
snapshot to `new ExactInventoryReports(source, now?)`. Call
`generateInventoryReport({ startDate?, endDate? })` or `generateMovementReport(...)`.
Neither reader is mounted. Standalone schemas are deliberately not exported from
contracts/index or attached to the published report union.

The source counts all seven hydrated owner/detail tables before reading their
rows. Each count must be at most the configured limit, capped at 100000. The
writer's connection and FIFO enclose one deferred transaction. Existing exact
repository reads join through nested savepoints. There is no await, second
connection, write, migration, cache, ledger or audit store. Existing codecs use
statement-local safe integer money projections and validate DZD and source operands.

A consumable balance is current stock at a typed warehouse/project location.
An asset carries its own authoritative purchase cost and current location, even
when parked without an internal location. Placement charges are not stock value.
Consumable sources preserve price4, agreed total/original quantity and derived
original quantity. Exact source lines are summed before finalization in each
report bucket. Display buckets need not add to a separately rounded grand total.
Amounts may exceed int64 in report aggregates, but never become JavaScript numbers.

Inventory retains legacy field names, item-name grouping, Arabic label sorting,
exact descending value sorting, and document-date aging at 30/89/179-day cutoffs.
The requested current-location/current-stock semantics intentionally replace the
legacy repository's purchase-entry quantity/location projection. Aging counts
entries once per bucket, not assets or split balances. Last update comes from
current stock records. All assets remain visible, including externally parked
units; no disposal write model is invented.

Date-only filters mean inclusive selected Algeria days. Timestamp filters retain
the supplied instant. Invoice business date, falling back to group creation,
controls inventory filtering and aging. Movement occurredAt controls movement
filtering. The stored timestamp's first seven characters remain the legacy period
bucket. A clock is captured once per call for generatedAt and default aging.

## Durable provenance limitation and honest policy proposal

`ExactInventoryService.createOutboundTransfer`, lines 331-343 at the base,
writes `OUTBOUND_SALE` for SALE, RETURN and GIFT. `inventory_movement` has no
outbound transfer foreign key. Its entry link and asset link permit authoritative
stock-cost valuation, but not authoritative matching to an outbound document.
Timestamp, quantity, note and location matching would invent provenance.

Keep legacy `summary.outboundSales` and `byType.OUTBOUND_SALE` as raw persisted
movement counts, including all outbound kinds, as the old reader did. Add
`outboundDocuments: [{ transferType: SALE | RETURN | GIFT, count }]`, counted
independently using each durable outbound document's transferDate. No outbound
sale-price or debt amount is added to movement stock cost. The parent must label
the raw legacy bucket honestly when mounting it. Per-kind movement quantities or
valuations require a future owner-approved writer/contract change to persist an
outbound identity. This lane does not make that change.

## Depth and locality

The reader module hides source rescaling, exact aggregation, window resolution,
location namespaces and sorting behind two methods. Deleting it would force each
report caller to reproduce those rules. The native adapter reuses the validated
inventory repository rather than duplicating monetary SQL codecs. No existing
domain interface changes. The parent still owns review of the new mounting seam.

## Proof and boundaries

Tests use native plain/keyed database files, actual exact schema statements and
actual inventory/finance producers. Derived consumable input is forbidden by the
purchase writer; one test explicitly persists source operands through the real
repository to cover the durable reader mode. Native total_changes proves report
reads do not mutate rows. Tests include FIFO refusal, pre-hydration row limits,
source corruption, wide money, price4, 10-over-3 splits/reversals, document aging,
selected-day boundaries, stored period buckets and typed location collisions.
Legacy monetary-bound report tests are retained and run directly.

The initial wide native test failed on both drivers because using UnitPrice to
represent asset Money narrowed its int64 range. The fix uses a Money-derived
source with original quantity one. Initial import-resolution failure and later
fixture/FIFO-start failures are retained separately, not counted as business red.
Most initial reader code preceded its tests; this is not a claim of full red-first
coverage. No historical-data conversion, browser, full suite, CI or #558 closure
is claimed.

Applied wisdom: money split shares must reconcile, exact lines are finalized only
after bucket aggregation. DatePicker's canonical yyyy-MM-dd input is accepted
without a display-format bridge. Allocation is not used because reports do not
redistribute persisted money. No wisdom files were changed.
