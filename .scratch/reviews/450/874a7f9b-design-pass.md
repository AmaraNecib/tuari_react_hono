# #450 — design pass at `874a7f9b`

Three skills, run over this diff (not the whole codebase).

## domain-modeling

**Vocabulary used, none invented where a word existed.** The change speaks in
the existing terms: *consumable balance*, *availability predicate*, *outbound
pick / write gate*. It adds exactly one new term, **quantity quantum**
(`QUANTITY_MIN`, six decimals), because the domain already distinguishes a
held balance from an empty one and the code had no name for the boundary.

**The rule is stated once, in the right place.** "A consumable quantity is
fractional, normalised to six decimals, and anything below the quantum is
empty" lives in `inventory.helpers.ts` and is consumed by both write paths and
both availability readers. The alternative — a literal `0.000001` in the SQL and
a second copy in the JS gate — is what produced the original picker/gate drift
class, so it is deliberately not repeated.

## codebase-design

**Deletion test on `roundQuantity`/`normalizeQuantity`.** Deleting them puts the
rounding back inline in `consumeConsumableFromSource` and `transferConsumable`,
re-introduces the unrounded sum, and loses the documented precision. They earn
their keep.

**Depth.** The interface is one number in, one number out; the float scaling,
the exponential fallback, the `-0` normalisation and the sub-quantum rejection
are all hidden. The call sites read as intent (`normalizeQuantity(item.quantity)`)
rather than arithmetic.

**Seams.** `QUANTITY_MIN` is now a real seam: it is the one value both the paged
picker's SQL `EXISTS` and `listItemStockAtSource` compare against, so the two
cannot accept different row sets. That is the seam the PR exists to protect;
before this diff the gate had its own `> 0` copy.

**Oversharing avoided.** The helper was first written in `@tuari/contracts`. It
moved into the inventory module because only the API writes balances, the web
never needs the quantum, and `@tuari/contracts` is a build artifact shared
across every worktree on this machine — an unnecessary surface for one API
consumer. Module-local is the smaller, correct home.

## improve-codebase-architecture

**Friction this diff created:** a third copy of the "scale the decimal string"
technique (`roundMoneyToCents`, `roundQuantity`). It is four lines and the two
helpers have different contracts (money is capped at `MAX_MONEY_DZD` and uses a
float product; quantity has no cap), so a shared
`roundToDecimals(value, decimals)` is plausible but not free.

**Disposition — deferred with a filed finding, not silently:** a generic
decimal-rounding primitive is a cross-package refactor (contracts `salary-days`
plus the API helper plus their tests). This PR is a bug fix and must not become
that refactor; the parent decides whether to file it. It does not leave the
codebase worse — it adds one small, documented helper.

**Friction this diff exposed (pre-existing, reported to the parent, not fixed
here):**

- `createOutboundTransfer` returns a bare record where the contract declares
  `createEntityResultSchema`, so every outbound create fails ORPC output
  validation on the client. Not introduced by this PR.
- The V2 multi-source picker sends entry/asset-unit ids where the write gate
  resolves a definition id. Not introduced by this PR.

Both are separate issues; folding either into a rounding fix would sprawl.

**Nothing else found** in the diff itself.
