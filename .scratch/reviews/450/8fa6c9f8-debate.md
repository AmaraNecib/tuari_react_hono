# #450 — adversarial review at `8fa6c9f8` (critic + defender)

## Critic

> "Rounding to six decimals is a new contract the wire schema never stated, and
> the outbound multi-balance total still rounds up, so a stored `0.7999996`
> satisfies a `0.8` request and is forgiven `4e-7` of stock. You also expanded a
> rounding fix into a contracts change (the asset `itemDefinitionId`) and a
> picker rewrite, and the two things the parent really wanted fixed are the ones
> you could not demonstrate."

## Defender

> "The quantum is the smallest scale at which the arithmetic is exact and
> `quantity > 0` is meaningful, and it is stated once. The forgiveness is bounded
> by that quantum, deletes the row, and never yields a negative balance; the
> alternative the first commit shipped was a zero-quantity movement or a raw SQL
> CHECK error. The patch is in the same endpoint the PR exists to fix, and the
> parent explicitly authorized both the envelope and the picker."

## Synthesis

Both are partly right. Outcome:

- **Kept** the request rounding + rejection (fixes two real MEDIUM regressions).
- **Kept** the raw compare on the inbound path.
- **Documented** the outbound forgiveness as bounded rather than claiming
  exactness; the wire-schema gap is recorded as a follow-up.
- **Kept** the envelope and picker fixes, with the asset schema field optional to
  avoid a required-field sweep.
- The critic's "you could not demonstrate it" is the honest state: the GIF is
  blocked by concurrent-lane shared-build churn, recorded with the exact reason
  in `8fa6c9f8-verification.md`.

No finding was dismissed without a stated reason.
