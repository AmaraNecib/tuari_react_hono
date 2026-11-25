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

Inventory is a purchase-entry projection, not a current-stock report. Each entry
contributes its original quantity, purchase location and updatedAt, regardless of
later internal transfers, outbound transfers or live balance deletion. Consumable
sources preserve price4, agreed total/original quantity and derived original
quantity. Asset entry sources retain the original sum of unit purchase costs,
recorded by createInvoiceGroup as a derived source with original and effective
quantity equal to the asset count. Placement charges are not inventory value.
MOVEMENT still values each linked asset at its own purchase cost and consumables
at the original entry source ratio. Exact source lines are summed before
finalization in each bucket. Display buckets need not add to a separately rounded
grand total. Report amounts may exceed int64 but never become JavaScript numbers.

Inventory retains legacy field names, item-name grouping, Arabic label sorting,
exact descending value sorting, and document-date aging at 30/89/179-day cutoffs.
Quantity and location come from the same purchase-entry fields as legacy
listInventoryValuations. Aging counts one row per entry, not one row per asset or
split balance. Last update comes from entry.updatedAt and uses the legacy lexical
maximum within an item-name group. Neither asset movement nor placement-charge
updates rewrite entry.updatedAt. All purchased entries remain visible, including
fully transferred/outbound stock. No disposal or as-of stock model is invented.

The first implementation incorrectly treated the current-stock engineering cue
as authority to change public report meaning. All three initial review lenses
identified this compatibility finding at 62806f45d5ffde1bad6ce9ac1450f5f15d785ad3.
The bounded correction restores the purchase projection without changing public
schemas, MOVEMENT behavior, snapshot/FIFO ownership or monetary codecs.

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
Legacy monetary-bound report tests are retained and run directly. The correction
adds an independent native purchase-10-at-A / transfer-4-to-B regression with
literal quantity, location, exact value, entry update time and aging expectations.
It failed on both drivers before the fix, emitting six at A and four at B. The
same case continues through full transfer and outbound removal without losing
the purchase row. A two-unit asset case pins entry-level aging and quantity,
purchase location/cost and creation update time after charge correction,
parking and outbound transfer. The typed-location test now introduces its second
location through a second purchase, not through current stock movement.

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

## Conditional review notes

Timestamp bounds already use Date.parse as supplied instants. No current Algeria
offset failure was demonstrated, so the correction does not replace date
infrastructure or add a dependency. The offset-change concern remains hypothetical.

The selected fresh exact root supplies now as new Date().toISOString() in
apps/api/src/app/fresh-exact-dependencies.ts:71. ExactInventoryService writes that
value into entry.createdAt/updatedAt on purchase and has no later entry mutation
for transfer, outbound or placement charges. The actual production purchase
entry timestamps are normalized UTC ISO strings, sortable lexically. The
noncanonical injected-clock scenario is not a demonstrated production failure.
This correction restores the legacy entry timestamp source and retains its
comparison rule, rather than changing it for a hypothetical persisted format.
