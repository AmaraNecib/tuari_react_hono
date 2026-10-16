# #450 — design pass

- **Reviewed code HEAD**: `e37e2561`
- **Base**: `origin/develop` @ `073af118`
- **Skills**: domain-modeling, codebase-design, improve-codebase-architecture (run over this diff).

## domain-modeling — does the change use the project's vocabulary?

Pass. The fix names the two id spaces the bug conflated: a **definition** is the
catalog row; an **entry** is a stock movement; a **balance** / **asset unit** is
the row that physically holds stock at a location. `listItemStockAtSource` and
`InventoryItemStockHolding` speak that vocabulary, and the write gate no longer
has a variable that could be either.

The availability rule is stated once — `resolveItemOffer` / `matchesItemOfferFilter`
in `packages/contracts/src/inventory-item-usage.ts` — and this change makes the
outbound write gate a caller of it instead of a private restatement. That removes
a second (wrong) copy of the rule, which is the domain-modeling outcome the issue
asked for.

The contract field `outboundTransferItemSchema.itemId` still carries an ambiguous
name. Renaming it is a wire change across web + api + the persisted FK; the
incremental fix is the doc comment added here, and the write gate no longer treats
it as an entry id.

## codebase-design — is anything shallow, is each seam real?

Pass.

- **Deletion test on `listItemStockAtSource`**: removing it forces the service to
  re-state the balance table + entry join + definition filter + deterministic
  order at the call site. It hides two tables and an ordering rule, so it is not a
  pass-through.
- **`stockAtSourceWhere` seam is real, not hypothetical**: two callers — the
  picker's `inStockAt` EXISTS (correlated) and `listItemStockAtSource` (concrete
  rows). Before this diff only the picker existed; the bug is precisely that the
  write path had no shared read. The seam now has two independent consumers.
- **No new duplication**: the previous code had two private availability checks
  (per-type branches); the diff leaves one rule + one read.

Noted and kept: because the read is source-scoped, the rule's `inStockAt` clause
is satisfied by the rows the gate just read; the check adds `itemTypes` +
`activeOnly` now and keeps the gate honest if the rule gains a field. A
definition-wide read would make `inStockAt` non-tautological but would push the
source filter into a second JS location-matching path, duplicating what the rule
already does. Source-scoped is the smaller, single-sourced form.

## improve-codebase-architecture — what friction did this create?

Pass, with two behaviours deliberately changed and documented in the design doc:

- Consumable outbound now consumes across every balance at the source (the picker
  offers a definition, not a balance) and writes one movement per balance. The old
  path always missed, so there is no working behaviour being replaced.
- Asset outbound writes one movement per unit with `assetUnitId`, mirroring
  `transferAsset`; the old one-movement-per-item shape is the odd one out.

No follow-up issue needed: the remaining ambiguity (`itemId` naming) is contained
by the contract comment and the renamed service variables; opening a rename refactor
from a bug-fix PR would sprawl.

Nothing found that this PR made worse; the cheap cleanups it exposed (the stale
`reports.test.ts` comment, the duplicated availability check) are fixed in-diff.
