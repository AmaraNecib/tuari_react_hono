# #450 — design pass at `8fa6c9f8`

Three skills, over this diff.

## domain-modeling

Vocabulary: *consumable balance*, *availability predicate*, *outbound pick /
write gate*, plus one new term, the **quantity quantum** (`QUANTITY_MIN`, six
decimals), because the domain needed a name for the empty/held boundary. The
envelope and picker fixes add no vocabulary; they align the endpoint with the
existing `createEntityResult` and *item definition* terms.

The rules are stated once: the quantum in `inventory.helpers.ts`, the envelope in
`successResult`, and the definition-id contract in the picker's `SelectedItem`
(`itemId` = definition, `optionId` = the concrete row).

## codebase-design

- **Deletion test** on `roundQuantity`/`normalizeQuantity`: deleting them puts
  the rounding back inline in two paths and loses the documented precision. They
  earn their keep.
- **Depth**: one number in, one number out; the scaling, fallback, `-0` and
  sub-quantum policy are hidden.
- **Seams**: `QUANTITY_MIN` is one value read by both the picker SQL and the gate
  read; `itemId`/`optionId` separates "what leaves" from "which row it came from"
  where the old code conflated them.
- **Oversharing avoided**: the rounding helper stays API-local; only the
  definition id the picker genuinely consumes was added to the asset read, and it
  is optional so it does not become a required field on every read.

## improve-codebase-architecture

**Friction created**: a second use of the "scale the decimal string" technique
(`roundMoneyToCents` and `roundQuantity`). A generic `roundToDecimals` is
plausible but the two helpers have different contracts (money is capped at
`MAX_MONEY_DZD`), so it is a cross-package refactor, not this bug fix. **Deferred
to a follow-up issue per the parent's decision 3.**

**Friction exposed and fixed in this PR (parent-approved):** the outbound create
returned a bare record where its contract declared an envelope, and the V2 picker
sent row ids where the gate resolves definition ids. Both are on the same
endpoint.

**Still deferred:** the wire schema advertises sub-quantum quantities; the V2
picker's per-row quantity model. Both recorded, neither silently dropped.

**Nothing else found** in the diff.
