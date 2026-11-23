# Inert exact-money interface

Import the additive capability from `@tuari/contracts`. Existing RPC schemas,
repositories and UI still use their old numeric contracts. Nothing here opts a
business workflow into exact-money writes.

```ts
const price = UnitPrice.parse("0.125");
const quantity = Quantity.inventory("3");
const line = priceLine(price, quantity);
const total = finalizeLines([line, line]);
// total.toWire() === "0.75", not "0.76"
```

## Input and wire

`Money.parse` accepts signed plain ASCII decimal strings with at most two places.
`UnitPrice.parse` accepts at most four. No whitespace, grouping, exponent, leading
plus, leading zeroes, numeric input or excess trailing-zero precision is accepted.
UI localization remains a separate future caller responsibility. Negative zero
normalizes to zero. `toWire` and JSON use two/four places respectively; `format`
uses optional decimals. `Money.format` can group digits without Number conversion.

Currency arguments validate DZD only. They reject other currencies rather than
pretend that V1 supports settlement or currency conversion. Future linked
account/document writers must inherit and validate the immutable owner's currency
in their transaction. This foundation creates no account or currency setting.

`Money.fromMinorUnits` and `UnitPrice.fromScaledUnits` decode exact integer strings
at their distinct scales. They reject values outside +/-9223372036854775807.
Addition, subtraction, negation and finalization check resulting values, not only
inputs. `sumMoney` returns a wider exact two-place report string, not a persistable
Money or permission to use overflowing SQL SUM.

`SalaryReference.parse` retains DAILY/MONTHLY/WEEKLY identity and its scale. It has
no period-only mutation. DAILY permits four places but displays whole entries
without forced decimals; MONTHLY and legacy WEEKLY permit two. It does not compute
or post earnings, corrections, netting or salary write-offs.

## Source authority and calculation

`priceLine` preserves price and quantity. `agreedLine` preserves the authoritative
final amount and its positive original quantity. `derivedPrice` keeps that total
and quantity, including asset-average or monthly-reference ratio operands.
Its `line` method values a requested quantity without caching an approximate rate.
`parseExactLine` validates the mode-specific wire metadata and reconstructs the
same calculation. Extra fields and approximate-price-only derived inputs fail.

`finalizeLines` sums exact line values before one nearest/ties-away-from-zero
finalization. It is not the operation for re-deriving settled historical records.
Quantity is a separate type. `Quantity.inventory` selects the existing six-place
quantum; `Quantity.parse` supports finite generic quantities through 18 places.
It does not silently round a quantity or replace existing quantity validators.

`allocateMoney` is for automatic allocation of an explicit finalized target.
Weights are nonnegative decimal strings with up to 18 places and a positive sum.
IDs are unique, nonempty strings of at most 128 characters. Array order is the
recorded tie order. Largest remainders conserve the target for either sign.
A partial target is supplied explicitly; the caller retains its unallocated
remainder. `reverseAllocations` negates recorded amounts without redistributing.
Manual allocation entry and transaction ownership remain with future workflows.

## Native storage capability

`apps/api/src/infrastructure/database/exact-money-storage.ts` provides native
BigInt bind values and opt-in prepared reads. A Money read must project exactly
one column aliased `minor_units`; a price read uses `scaled_units`. Extra columns
are rejected at preparation. SQL NULL returns null, no row returns undefined,
and zero is a known Money/UnitPrice. REAL/TEXT results and the asymmetric negative
native int64 endpoint fail. Counts, flags, IDs and timestamps stay in their own
ordinary projections. Statement-local safe integers never change global mode.

This is storage preparation, not a migration or a new writable ledger. No
production caller uses it. Future activation must provide the actual schema,
source-mode storage, inherited currency, field sign/null constraints and atomic
posting/resulting-balance validation under its own approved issue.

## Resource limits and proof boundaries

Decimal input is at most 96 characters. A calculation/allocation/report call
accepts at most 10000 items. Exact rational calculation coefficients are limited
to 256 decimal characters before reduction; a complex derived sum may reject
within ordinary amount bounds rather than consume unbounded resources. These
are computation guards, not smaller commercial money caps. Original operands
remain the wire authority; raw BigInt never crosses JSON.

Focused tests cover the shared interface, physical inventory and both selected
plain/encrypted factory drivers, including initialized payment naming, reopen,
exact binding/decoding, NULL, projection isolation, rollback and rejected readers.
This does not prove conversion, full backup restoration, packaged runtime or
release readiness. See [the caller matrix](523-caller-matrix.md), [approved ADR](../adr/0001-exact-money-contract.md)
and [the committed design](../../.scratch/implementation/523-design.md).
