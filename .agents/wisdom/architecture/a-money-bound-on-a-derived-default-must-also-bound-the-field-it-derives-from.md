## A money bound on a derived default must also bound the field it derives from (🟠 Major)

On #413 the charge default was validated against the contract's
`MAX_MONEY_DZD`, but the invoice asset `purchasePriceDzd` input and its stored
entity shape stayed on `z.number().nonnegative()`. That gave one money field two
ceilings: a purchase price the invoice path accepted blew up later when the
charge default was resolved, so a direct-to-project purchase rolled back while
the identical warehouse purchase succeeded. The same round found the symmetric
leak on the aggregate: each charge was bounded, the project total was not, and
`totalDzd` shared the per-charge bound.

**Always**: when you add or tighten a bound on a derived value, walk the source
field it derives from and give both the same bound. When a response schema
shares a bound with N input values, the aggregate of those values needs its own
explicit check. Prefer the shared contract schema (here
`nonNegativePaymentAmountSchema`) at both the wire gate and the module seam, the
#289 pattern, so the two cannot drift.

