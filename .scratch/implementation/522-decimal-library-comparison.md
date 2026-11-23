# BigInt versus decimal.js for issue 522

## Recommendation

Retain the council's proposed BigInt-first, scaled-integer direction for the
currently agreed finite-decimal scope. A decimal library is a viable alternative,
not an automatic data-loss fix. It shortens selected arithmetic code but adds a
precision context, another runtime dependency and still needs exact operands for
nonterminating derived rates when subsequent operations can affect a cent tie.
The owner has not yet given final engineering approval or completed #522.

This is a bounded executable comparison of throwaway adapters. It is not a
production implementation, security review, generalized property proof, full
library evaluation or application benchmark. No source/schema/manifest/lockfile
or installed package was changed for this experiment.

## Existing library and primary sources

`decimal.js@10.6.0` was already installed and locked as a jsdom test dependency
in the #521 source tree. It is not a declared production dependency of contracts,
API or web. The experiment requires its exact existing absolute path; it does
not rely on transitive hoisting in application code. Shipping it later would need
a direct dependency declaration and the owner's package-vetting process.

Source tree head `4f1c73d3b8c4edaad420d146dfc93c58392d666b`, application source
`17d6277bee359a059d0af5d5befaa887446fae9b`. Runtime Windows x64 Node v22.23.2.
Read the installed package.json, README and decimal.mjs. Official source:
https://github.com/MikeMcl/decimal.js/tree/v10.6.0
Official API: https://mikemcl.github.io/decimal.js/

The README explicitly states that precision means significant digits, all
calculations round to that precision, constructors can be cloned for independent
configuration, and exact decimal input should be supplied as strings. The source
sets default precision 20 and ROUND_HALF_UP. Its name means nearest with ties
away from zero, matching the selected signed rule. The wrapper still validates
our narrower decimal input grammar because the library accepts values such as
hexadecimal and Infinity that are not acceptable monetary input.

## Identical experiment contract

Two scratch adapters implement finalizing invoice products, summing finalized
amounts, deriving a quantity's amount from original source operands, and equal
allocation of a finalized amount. Both use the same lexical/scale validation.
The BigInt adapter uses four-decimal entered prices, six-decimal quantities and
exact integer products with quotient/remainder rounding once at finalization.
The decimal adapter uses clone-local ROUND_HALF_UP, tested at default 20 and a
candidate 50 significant digits. Fifty is experimental, not a proven production
precision bound. A 100-character lexical guard is likewise experiment-only.

Each checks 13 scenarios with literal expected results: 0.125 times ten,
invoice-level sum of two 0.375 lines, positive/negative half ties, canonical zero,
four-by-six-decimal product, maximum positive int64 cents, a report total beyond
int64, a much wider report preserving a cent, salary proration as an amount
proposal, bundle-source valuation, and positive/negative automatic allocations.
All variants also reject excess unit-price precision, NaN and hex inputs.

## Results and meaningful caveats

- BigInt: 13/13 selected amount scenarios passed.
- decimal.js configured to 50 significant digits: 13/13 passed.
- decimal.js default 20 significant digits: 12/13 passed. A report total
  `100000000000000000000.00 + 0.01` lost the cent during the addition. This is
  beyond single-value int64 storage, deliberately testing the owner's proposed
  wider report totals. It does not show that ordinary int64 payments fail with
  the default or that decimal.js cannot support this total when configured.
- Both decimal configurations approximate 100/3. If a caller caches that
  quotient, multiplies by 3 and subtracts 99.995, they produce a value just
  below 0.005, rounding to 0.00. Preserving the exact original ratio yields
  0.005 and approved rounding gives 0.01. This constructed boundary control
  tests composed derived rates, not the ordinary invoice formula. Keeping
  multiplication before division passes the ordinary bundle test on both
  approaches. Do not present this as an unavoidable decimal.js bug or a policy
  permitting discounts/adjustments that the owner has not approved.

Neither option changes SQLite's int64 limits, fixes legacy REAL intent, chooses
a financial rounding boundary, or makes old/new schema writers compatible.
Neither prototype provides the complete signed allocation/reversal policy,
persistence bounds, denominators/row limits or production authorization.

## Size and elapsed measurements

BigInt scratch adapter: 36 nonblank lines, 1746 bytes. Decimal scratch adapter:
23 nonblank lines, 1474 bytes. Shared validation: 7 lines, 322 bytes. The decimal
adapter's direct arithmetic is shorter. These are parent-authored minimal
prototypes, not independent estimates of final maintenance effort; line count
alone does not determine design quality. The exact-ratio boundary example is a
separate control, not an implemented universal rational library in either adapter.

Installed decimal.mjs is 127787 bytes, gzip 32222 bytes without minification.
This is source size, not measured production bundle impact. Existing jsdom use
means installed availability, not that it is already shipped in the runtime.

One warm microbenchmark, 5000 two-line invoice calculations: BigInt 13.13 ms,
Decimal20 38.44 ms, Decimal50 25.86 ms. No robust statistical or application
performance conclusion follows; all were fast for these tiny inputs, and this
is not a selection gate. Full builds/benchmarks were not justified or run.

## Reproduction and evidence boundary

Scratch files:
`.scratch/sessions/522-decimal-comparison/{inputs,bigint,decimal,compare}.cjs`.
Raw output: `.scratch/sessions/522-decimal-comparison/results.json`.

Command from the existing #521 worktree:

```text
node D:/projects/tuari_react_hono/.scratch/sessions/522-decimal-comparison/compare.cjs
```

Exit 0, tool wall time under one second. The runner records differences for the
default-precision and cached-quotient controls; those are intentional negative
observations, not passing exactness claims. It refuses overwriting results.json.
Native driver execution and implementation review lenses were not repeated.
No claim of current-head CI, published PR or release acceptance.

## Next owner decision

Choose the BigInt-first direction with a small shared money interface, exact
local source ratios where needed, checked/reversible persisted ranges and exact
wire encoding, or request a broader dependency evaluation. A production decimal
library comparison would need vetted direct dependency adoption and proof of a
sufficient precision/error policy across the supported input and operation bounds.
Do not silently choose a finite precision and call all operations exact.
