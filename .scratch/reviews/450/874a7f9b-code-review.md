# #450 — code review at `874a7f9b` (round 4)

Two axes, as the repo's `code-review` skill asks: **Standards** (does the diff
follow the repo's rules?) and **Spec** (does it satisfy the finding?).

## Spec

The Greptile P1 asked for three things; all three are pinned by a test that
fails without the fix (see `874a7f9b-verification.md`):

| Requirement | Where |
| --- | --- |
| `0.7 + 0.1` accepts a `0.8` request | `outbound-transfer-availability.test.ts` "accepts a request equal to the sum of fractional balances" |
| A full consume leaves no residual the picker offers | "leaves no float residual the picker would still offer after a full consume" |
| A genuine partial keeps the correct remainder | "leaves the exact remainder on a genuine partial consume" |

Plus the sibling inbound path and the sub-quantum/parity cases the review found.

## Standards

- Rounding is stated once (`roundQuantity`) and used by both write paths; the
  availability bound is stated once (`QUANTITY_MIN`) and used by the picker SQL
  and the write-gate read. No duplicated predicate.
- The error is an `InventoryError("VALIDATION", …)` with an Arabic message and a
  `field`, matching every other guard in the service.
- Tests drive the real `InventoryService` over the production schema
  (`ensureDatabaseSchema` + `createInventoryRepository`), not a stub.

## Independent review findings and dispositions

A fresh-context reviewer ran over `b26af0ae..06fd14fc`. The MEDIUM findings were
**introduced or exposed by the first commit** and are fixed in `874a7f9b`:

1. **MEDIUM — zero-quantity balance writable.** `transferConsumable` with
   `quantity: 4e-7` inserted `quantity: 0` on the target (raw SQL CHECK error).
   **Fixed** by `normalizeQuantity` (reject a request that rounds to zero) and
   covered by "rejects an inbound request below the storage quantum".
2. **MEDIUM — sub-quantum outbound consumes nothing.** `consumed = 0` wrote a
   zero-quantity `OUTBOUND_SALE` and left the balance untouched. **Fixed** by the
   same guard; covered by "rejects a request below the storage quantum".
3. **MEDIUM/LOW — rounded comparison accepts an over-request.** A stored
   `0.4999996` satisfied a `0.5` request. **Fixed** in `transferConsumable` by a
   raw source compare. The outbound multi-balance total is still rounded: a
   shortfall below the 6th decimal is forgiven, which is the documented quantum
   and never produces a negative balance. This limit is intentional, not silent.
4. **LOW/MEDIUM — movement vs balance delta drift.** The inbound movement
   recorded the raw request while the balances moved the rounded value.
   **Fixed**: the movement records the rounded quantity.
5. **LOW — fallback not half-away-from-zero, `-0` leaks.** **Fixed**; the
   exponential fallback now rounds `Math.abs` with the sign, and `-0` normalises
   to `0`.
6. **LOW — picker/gate parity unenforced for legacy rows.** A stored `1e-7` was
   offered by the picker but rounded to zero at the gate. **Fixed** by making
   `QUANTITY_MIN` the predicate on both sides.
7. **LOW — stale `packages/contracts/dist` exported `roundQuantity`.** That is a
   gitignored build artifact in this worktree left by a discarded scratch build
   (the contracts source was reverted; nothing from it is committed). Not a
   source issue; the PR touches no contracts file.
8. **LOW — test gaps.** Addressed; see `874a7f9b-test-audit.md`.

## Residual risk

- A legacy balance between the quantum and a request can be consumed with a
  sub-quantum over-forgiveness on the **outbound** path (the row is deleted, so
  no negative balance exists). Bounded by `QUANTITY_MIN`; no data loss.
- Asset quantities are not integer-validated (pre-existing; the slice already
  rejected a fractional count that exceeded the units). Out of scope.
