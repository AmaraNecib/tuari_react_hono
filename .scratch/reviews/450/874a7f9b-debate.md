# #450 — adversarial review at `874a7f9b` (critic + defender)

## Critic

> "The fix trades one float bug for a precision policy nobody agreed to. You
> round to six decimals and reject anything below `1e-6` — that is a new
> contract, and the wire schema still says `z.number().positive()`. A caller
> sending `4e-7` now gets an Arabic `VALIDATION` error it cannot predict from the
> contract. And in `consumeConsumableFromSource` you still round the *sum* and
> then round each `consumed`, so a stored `0.7999996` can satisfy a `0.8`
> request and be forgiven `4e-7` of stock — the exact class of bug you were sent
> to fix, just below the visible threshold."

## Defender

> "The policy is not invented; it is the smallest precision at which the
> arithmetic is exact and the `quantity > 0` predicate is meaningful, and it is
> stated once (`QUANTITY_DECIMALS`, `QUANTITY_MIN`). Rejecting a sub-quantum
> request is strictly safer than the alternative the first commit had, which was
> to write a zero-quantity movement or hit a raw SQL CHECK. On the forgiven
> `4e-7`: it deletes the row and credits the rounded request, so no balance goes
> negative and the ledger stays self-consistent; it is bounded by the same
> quantum the storage now uses. The raw compare on the single-balance inbound
> path shows the multi-balance path is a deliberate choice, not an oversight."

## Synthesis

The critic is right that the *outbound multi-balance* comparison can forgive a
sub-quantum shortfall; the defender is right that it cannot corrupt a balance
and that the alternative is worse. Outcome:

- **Kept** the request rounding + rejection (fixes two real MEDIUM regressions).
- **Kept** the raw compare on the inbound path (removes the over-request).
- **Documented** the outbound forgiveness as bounded by `QUANTITY_MIN` rather
  than claiming exactness, and left the wire-schema bound as a follow-up.
- The critic's strongest point — "the contract still advertises sub-quantum as
  valid" — is real and is recorded in the test audit as the remaining gap.

No finding was dismissed without a stated reason; the one real disagreement is
resolved as a bounded, documented trade-off.
