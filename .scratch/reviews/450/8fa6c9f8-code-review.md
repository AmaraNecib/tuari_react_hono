# #450 — code review at `8fa6c9f8`

Two axes: **Standards** (repo rules) and **Spec** (the P1 + the parent decisions).

## Spec

The Greptile P1's three requirements are each pinned by a test that fails without
the fix (see `8fa6c9f8-verification.md`): `0.7 + 0.1` accepts `0.8`; a full consume
leaves no residual the picker offers; a genuine partial keeps the correct
remainder. Parent decision 1 (envelope) is pinned by the new envelope test.
Parent decision 2 (V2 picker sends definition ids) is implemented for consumables
and assets.

## Standards

- Rounding is stated once (`roundQuantity`) and the availability bound once
  (`QUANTITY_MIN`), shared by the picker SQL and the gate read. No duplicated
  predicate.
- Errors are `InventoryError("VALIDATION", …)` with an Arabic message and a
  `field`, matching every other guard.
- `createOutboundTransfer` now uses the same `successResult` helper as the other
  create handlers.
- Tests drive the real `InventoryService` over the production schema.

## Review findings (fresh-context reviewers at `06fd14fc`) and dispositions

The MEDIUM findings were introduced or exposed by the first decimal commit and
are fixed:

1. **MEDIUM — zero-quantity balance writable** (`transferConsumable`, 4e-7).
   Fixed by `normalizeQuantity`.
2. **MEDIUM — sub-quantum outbound consumed nothing and wrote a zero movement.**
   Fixed by the same guard.
3. **MEDIUM/LOW — rounded comparison accepted an over-request** (stored
   `0.4999996` vs `0.5`). Fixed by a raw compare in `transferConsumable`; the
   outbound multi-balance total still forgives a shortfall below the 6th decimal,
   which is the documented quantum and never produces a negative balance.
4. **LOW/MEDIUM — movement vs balance-delta drift.** Fixed: the movement records
   the rounded quantity.
5. **LOW — fallback not half-away, `-0` leaked.** Fixed.
6. **LOW — picker/gate parity unenforced for legacy sub-quantum rows.** Fixed by
   `QUANTITY_MIN`.
7. **LOW — stale `packages/contracts/dist` exported `roundQuantity`.** A
   gitignored artifact from a discarded scratch build; not committed.
8. **LOW — test gaps.** Closed; see `8fa6c9f8-test-audit.md`.

## Review of the envelope and picker fixes

- The envelope fix matches the client (`inventory-hooks.ts:566` already reads
  `requireEntitySuccess(...)`), so it removes a real failure rather than changing
  a working contract.
- The picker now sends `itemDefinitionId`, matching the FK and the write gate. The
  new `optionId` preserves the per-row selection the previous unit/entry id gave
  dedupe, so multi-balance and multi-unit picks still work.
- `inventoryAssetUnitSchema.itemDefinitionId` is **optional**: the field is only
  resolved where the read joins the entry (the location listing the picker uses),
  and making it required would have forced a field onto every asset fixture and
  read in the repo for no consumer. Documented on the schema.

## Residual risk

- Outbound sub-quantum shortfall forgiveness is bounded by `QUANTITY_MIN`; the
  row is deleted, never negative.
- The wire schema still advertises sub-quantum quantities as valid; a wire bound
  is a follow-up.
- The V2 picker's per-row quantity model means a definition's stock split across
  balances is picked row by row; the server still consumes across balances. Not a
  regression, but it limits what the V2 UI can express.
