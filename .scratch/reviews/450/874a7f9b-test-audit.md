# #450 — test audit at `874a7f9b`

Auditor: fresh-context `test-audit` pass over `b26af0ae..06fd14fc`, then the gaps
were closed in `874a7f9b`.

## Gaps found and their resolution

1. **Noisy request never rounded.** The gate compared `roundQuantity(available)`
   against the **raw** `input.quantity`, so a wire-legal `0.1 + 0.2`
   (`0.30000000000000004`) was rejected against a `0.3` balance. → Fixed
   (`normalizeQuantity`) and pinned by "rounds a noisy request before comparing
   it with the available total".
2. **7th-decimal quantities untested end-to-end.** A sub-quantum request wrote a
   zero-quantity movement; a sub-quantum balance was offered by the picker but
   rejected by the gate. → Fixed and pinned by three tests ("rejects a request
   below the storage quantum", "rejects an inbound request below the storage
   quantum", "treats a sub-quantum balance as empty in both the picker and the
   gate").
3. **The inbound "existing destination balance" branch never ran.** The only
   inbound test moved into an empty target. → Pinned by "keeps an inbound
   movement equal to its balance deltas on a noisy request", which moves twice
   into the same target and asserts `0.1 + 0.2 → 0.3`.
4. **Fractional over-total rejection missing.** The over-total test used integers
   only. → Pinned by "rejects an inbound request above a fractional stored
   balance" (`0.4999996` vs `0.5`).
5. **`remaining <= 0` vs the old `=== 0`.** No test distinguished them. → The
   partial-remainder and full-consume tests now assert the stored row value and
   that an emptied balance is absent, which the old `=== 0` could not satisfy
   once a residual existed.
6. **Movement vs balance delta drift.** No invariant test. → The inbound delta
   test asserts the movement quantities equal the balance deltas.
7. **Unit coverage of negative / half-tie / boundary.** → `inventory.helpers.test.ts`
   now covers `-0.7 - 0.1`, `-5e-7`, `1.2345678 → 1.234568`, `1e21`, `-0`
   normalisation, and the `QUANTITY_MIN` boundary.

## Not a gap (confirmed by the auditor)

- The four new integration tests are not shallow: each fails with the fix
  reverted (traced `0.7999999999999999 < 0.8`, the `2.78e-17` dust residual,
  `0.49999999999999994` remainder, inbound `0.5`).
- They drive the real service over the production bootstrap, including the real
  SQL availability predicate.
- Non-finite and both fallback paths are covered.

## Remaining known gap

The tests call `InventoryService` directly, so nothing pins what the HTTP wire
(`z.number().positive()`) accepts. A sub-quantum quantity is now refused by the
service, but the schema still advertises it as valid; a wire-level bound is a
follow-up, not this fix.
