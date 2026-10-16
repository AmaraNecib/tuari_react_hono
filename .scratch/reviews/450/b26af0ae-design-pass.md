# #450 — design pass (post-review)

- **Reviewed code HEAD**: `b26af0ae`
- **Base**: `origin/develop` @ `073af118`
- **Skills**: domain-modeling, codebase-design, improve-codebase-architecture.

The first design pass ran at `e37e2561` (`e37e2561-design-pass.md`, removed when the
round was superseded). This pass covers the review-round diff.

## domain-modeling

Pass. The review round strengthens the vocabulary the change introduced: the source is
constructed once and consumed as `InventoryItemOfferSource`; `outboundFromLocation`
names the movement's from-location; `itemOfferCandidate` names the rule evidence built
from `InventoryItemStockHolding`. No new domain rule; the one availability rule stays in
`inventory-item-usage.ts` and the write gate calls it. The stale JSDoc that claimed the
gate did not consult the rule is corrected, which is a domain-model correction, not just
a doc edit (the comment was the only place stating the false invariant).

## codebase-design

Pass. Two baseline smells the first pass left (inline candidate projection, duplicated
note/from-ternary) are now one named helper and one derivation each, so the deletion
test is stronger: removing `itemOfferCandidate` forces the service to re-state the row
shape; removing `outboundFromLocation` forces it to re-switch on the source. The
`stockAtSourceWhere` seam keeps two real callers. No new seam added by the review round.

## improve-codebase-architecture

Pass. The review round removed friction rather than adding it (fewer duplicated
literals, one source discriminator). The one behaviour added — rejecting a non-positive
quantity in the service — matches the module's existing convention (`normalizePositive`
in `transferConsumable`), so it does not create a new style. The cross-type mis-typed
row asymmetry is dismissed as unreachable, with the reachability guard cited
(`inventory.service.ts:429,453`); no follow-up issue needed because the picker's
both-tables rule is a deliberate #465 decision, not friction introduced here.

Nothing found that this round made worse.
