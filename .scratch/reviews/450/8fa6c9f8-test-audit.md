# #450 — test audit at `8fa6c9f8`

Fresh-context `test-audit` over `b26af0ae..06fd14fc`, gaps closed in `874a7f9b`
and `8fa6c9f8`.

## Gaps found and closed

1. **Noisy request never rounded.** `roundQuantity(available)` was compared with
   the raw `input.quantity`, so `0.1 + 0.2` was rejected against a `0.3` balance.
   Fixed and pinned by "rounds a noisy request before comparing it with the
   available total".
2. **7th-decimal quantities untested end-to-end.** Sub-quantum requests and
   balances. Fixed and pinned by three tests (outbound rejection, inbound
   rejection, sub-quantum balance empty to picker and gate).
3. **Inbound "existing destination balance" branch never ran.** Pinned by the
   delta test that moves twice into the same target.
4. **Fractional over-total rejection missing.** Pinned by the `0.4999996` vs `0.5`
   test.
5. **`remaining <= 0` vs the old `=== 0`.** The partial/full-consume tests assert
   the stored value and the row's absence.
6. **Movement vs balance delta drift.** The delta test asserts the movement
   quantities.
7. **Unit coverage of negatives / half-ties / boundary.** `inventory.helpers.test.ts`
   covers `-0.7 - 0.1`, `-5e-7`, `1.2345678`, `1e21`, `-0`, `QUANTITY_MIN`.
8. **Envelope untested at the service boundary.** `8fa6c9f8` adds "returns the
   create envelope the RPC contract declares"; it fails on the bare-record
   service and passes on `successResult`.

## Not a gap (confirmed)

- The four core integration tests are not shallow: each fails with the fix
  reverted.
- They drive the real service over the production bootstrap, including the real
  SQL availability predicate.
- Non-finite and both `roundQuantity` fallback paths are covered.

## Remaining known gap

- The tests call `InventoryService` directly, so nothing pins what the HTTP wire
  (`z.number().positive()`) accepts. A sub-quantum quantity is refused by the
  service but the schema still advertises it as valid; a wire-level bound is a
  follow-up.
- There is no web test for `MultiSourceItemPicker`; the definition-id change is
  covered by `pnpm typecheck` against the contract, not by a render test.
