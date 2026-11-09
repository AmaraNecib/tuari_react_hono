# Issue 522 exact-money contract

Status: corrected consolidated draft for the final council's second pass. The
owner conditionally accepts the complete Markdown if all three advisors accept
this same corrected version without material blockers. The live interview
approved the decisions below, including optional four-place DAILY wage input.
Council acceptance is still pending; no implementation, migration, PR, issue
closure or release is authorized by this draft. The detailed interview record is
[522-money-decisions.md](522-money-decisions.md).

## Scope and decision

Use one exact-money model across all V1 financial paths, including the 17 existing
monetary tables and 27 money/rate columns inventoried by #519/#520, plus new
monetary fields. Keep quantities, days and percentages distinct. Do not replace
the authoritative debt ledger or implement FX/cross-currency settlement.

Alternatives considered: scaled BigInt, late promotion from Number, exact decimal
TEXT persistence and a decimal library. Three independent same-family advisors
recommended BigInt from exact input. A bounded executable comparison with the
already installed decimal.js supported this direction without establishing
production correctness. No new decimal runtime dependency is selected.

## Representation and maximum practical exact range

- Parse monetary values from decimal strings, without an intermediate Number.
  Use private BigInt coefficients from the start. Do not dynamically promote
  after a numeric overflow or change persisted representation on overflow.
- Persist finalized money as checked signed int64 currency minor units. DZD uses
  two decimal places, so 125.50 DZD is stored as 12550 minor units.
- Use a reversal-safe symmetric domain of +/-9223372036854775807 minor units.
  This excludes only native int64's single un-negatable negative endpoint.
  Existing field-specific sign/zero rules remain stricter where appropriate.
  Maximum positive finalized DZD value is 92233720368547758.07. Check resulting
  balances and all persisted derived values atomically, not only each posting.
- Persist entered unit prices in distinct four-place integer DZD units. If
  represented by int64, use the same symmetric coefficient bound, giving a
  maximum positive entered price of 922337203685477.5807 DZD per unit. A price
  bound is not the same as the finalized amount bound.
- Do not invent a smaller arbitrary commercial cap. Application BigInt
  intermediates/report aggregates may exceed persisted int64. Never send them
  through overflowing SQL multiplication/SUM, REAL or a Number bridge. Reject a
  financial write whose required persisted values do not fit; do not clip.
  Pure report sums can remain wider exact strings. Bound inputs, operation
  counts and resources explicitly in the implementation, not with a false
  promise of unlimited computation.

These range rules are the engineering consequence of the chosen int64 and
reversibility model and are included for final owner confirmation. Full native
bind range is not proof of full-range application workflows.

## Entered values, products and derived rates

Entered final amounts permit at most two fractional places; entered unit prices
permit at most four. Reject excess precision with a clear message, rather than
silently changing user input. Do not conflate input validation with rounding
computed results. Reject nonfinite, hexadecimal or exponent-form wire values.
Define bounded canonical decimal-string codecs and preserve existing supported
localized entry behavior through explicit UI parsing, not Number conversion.

Inventory quantities retain the existing six-decimal quantum, not currency
precision. A four-place price times a six-place quantity can require ten product
fractional places. Keep exact coefficients/scales or exact original operands;
do not store every intermediate as cents or as a four-place rate.

Ordinary finite-decimal products need scaled integers, not a universal rational
framework. When division creates a derived rate, preserve its original numerator
and denominator locally until the final financial result. BigInt division alone
truncates a fraction and is not the rounding algorithm. Rates derived from a
reference salary do not authorize new salary policy or mandatory proration.

The complete field-by-field classification is
[522-money-field-classification.md](522-money-field-classification.md): exactly
27 monetary columns across 17 initialized tables, tied to actual writer/reader
paths. Twenty are finalized amounts/snapshots, two are salary references/history,
three are entered/derived prices and two are exact-line/agreed-total values.
No additional entered rental, commission, interest or FX-rate column was found
among these 27. This is semantic coverage, not an exhaustive caller conversion.

An individual agreed asset purchase price, paid amount, expense or monthly salary
reference is not a four-place entered unit price merely because of its name.
DAILY salary input, however, is a price per working day: normally a whole DZD
entry, with up to four fractional places permitted when needed under the owner's
option 2. Do not force decimal display, add fractions to whole entries or require
a new settings switch. Explicit MONTHLY and legacy WEEKLY reference amounts use
two places. Preserve the tagged period/scale together in current and historical
reference storage; never reinterpret an existing coefficient when the period is
changed. A paired period/rate update must preserve the intended DZD value or
require an explicit new reference. Four-place DAILY rates use the price bound;
two-place period references use the finalized-amount bound.

Compute a DAILY-based proposal from the exact entered rate times whole days,
then finalize the monetary result. A MONTHLY-derived daily rate retains the
exact period-reference/30 ratio. A payment-derived report day rate retains the
actual payment/days ratio. Legacy WEEKLY behavior remains unprorated and not
offered as a new UI selection. Do not expand this precision choice into daily
earnings history, new period support or mandatory salary calculations.

Preserve source mode for entered versus derived prices, including the existing
asset-group mean. Exact line products may exceed int64 at product scale even
when final cents fit: keep typed source operands and derive their logical value,
or use a proven exact cache encoding with no independent write authority. Do
not blindly convert all legacy line totals into cents. Preserve generic invoice
quantity semantics separately from inventory's six-place quantum. If later
caller discovery reveals a genuinely new business rate outside the classified
categories, return the concrete new decision to the owner; no listed field is
left unclassified as a way to defer this contract.

## Financial finalization and original agreement

For an entered unit-price agreement, multiply exact price by quantity and sum
exact invoice line products. Round the document total once to two DZD places.
Use nearest with exact ties away from zero, normalize zero, and preserve
round(-x) = -round(x). Two 0.375 lines total 0.75, not 0.76.

When the user instead enters an agreed line/group total, that amount is the
source of truth. Preserve the amount and original quantity for derived unit
pricing. Example: 300 units for 10000 DZD is not changed to 9999.99 by storing
a truncated 10000/300 rate and multiplying back. Record source mode/operands
unambiguously; any derived or approximate price must not become the independent
writable authority. Continue respecting authorization and finalized-document
edit restrictions.

Negotiating 10050 DZD down to 10000 DZD is an intentional agreed-price change,
not automatic currency rounding. No automatic whole-number rounding or new
discount subsystem is authorized. Invoice, debt and payment effects use the
same agreed finalized amount. Likewise, the owner's description of pragmatic
salary differences of 10/20/50/100 DZD does not authorize silently discarding
a difference or automatically rounding to those thresholds. Keep computed,
explicitly agreed and actually paid values distinguishable under existing
workflow authority; this contract does not invent salary/debt netting policy.

A report sums finalized financial records without re-deriving them from rounded
unit prices or unrounded historical products. Separate valuation computations
must declare their own finalization boundary and follow approved semantics.
Do not silently reattribute historical costs to reconcile a screen.

## Allocations, partial payments and reversals

Automatic allocations of a finalized amount conserve that amount in minor units.
Distribute rounding remainders deterministically; exact ties follow recorded
split order, not a later UI sort. A fully allocated 100 DZD split three ways
is 33.34, 33.33 and 33.33. A partial allocation must conserve its approved target
and leave the remainder explicitly unallocated. Do not alter manual allocations
silently. Share authoritative allocation results across screens and reports.

Reverse recorded allocations rather than rerun a distribution with potentially
different remainder recipients. Check posting and resulting-balance bounds in
the same transaction. Allocation identities must survive display reorder/reload.

Partial payment applies to a finalized invoice total: 0.75 minus 0.25 leaves
0.50. It does not reprice lines or introduce line-based settlement in this scope.

## Currency ownership and exact wire

V1 enables DZD only; current UI displays دج. DA/DZD labels do not identify
separate currencies. Future currency support must use explicit metadata and
scales rather than assuming every currency has two decimals. No new currency
picker, French locale or FX functionality is added now.

Each debt account owns one fixed currency; entries inherit it and reject
mismatches. Uniqueness is party plus direction plus currency. Preserve current
PAYABLE and RECEIVABLE separation and the single authoritative ledger. No
implicit netting or cross-currency settlement. Displayed net is informational.

Invoices, linked accounts and payments share currency. A payment allocating
across invoices requires the same currency for every linked invoice/account.

Final amount wire values are exact decimal DZD strings, such as `"125.50"`.
Unit-price/intermediate codecs preserve their distinct meaning and precision;
derived-source metadata must not be replaced by an approximate formatted value.
Use explicit exact cursor codecs for money sorting. Retain numeric ordering,
tie-breaks and validators without converting a large monetary key to Number.
Canonical formatting and codec details are engineering work under these
semantics; they are not permission to broaden accepted financial values.

Use statement-local exact reads or another proven narrow projection. Safe reads
also change unrelated integer columns in that statement, so decode/isolate them
deliberately. Do not globally switch the application's integer mode. Reconcile
physical initialized schema, Drizzle declarations and actual repository paths.

## Missing values and partial updates

Explicit zero is a known value where the field permits it. An unspecified
optional amount is not zero. A missing required amount fails validation; this
does not permit zero payments or weaken existing field constraints.

An omitted property in an update preserves the previous value. Explicit NULL
clears only an optional nullable field. Explicit zero writes zero only where
legal. Clearing a reference salary does not delete prior payments, earnings or
debts. This is a logical update contract, not a mandate to change RPC transport.

Opening review is a separate domain state: unreviewed is not reviewed-and-zero.
It remains nonblocking for payment under the earlier owner decision. Do not add
a review workflow to every financial field or reinterpret legitimate stored
zeros/computed defaults as missing values.

## Display decisions

Preserve optional decimals and the existing grouped/ungrouped display preference;
integer values need no forced .00 in UI. Wire canonical decimals and stored
scales are separate from display preferences.

Show exact intermediate line values when necessary to explain totals. Show a
nonterminating derived rate approximately, for example `≈ 33.3333 DZD`, while
retaining exact original operands and the agreed document amount. Approximate
presentation must never feed back into calculation or persistence.

Debt labels default to نسالوه for RECEIVABLE and يسالنا for PAYABLE. Settings can
switch to مستحقات لنا and مستحقات علينا. A visually small question-mark icon
sits next to the label, slightly above its baseline, not directly above the word.
Explain with هو مَدين لنا، ونحن نستلم منه or نحن مَدينون له، ونحن ندفع له.
Provide a comfortable hit target and keyboard/touch access as well as hover.
These are approved design directions; actual rendered UI still needs owner
approval before merge. Do not expand financial implementation lanes into
competing UI writers; assign this display work explicitly in the delivery map.

## Existing development data and activation

Change the schema non-destructively. Keep original database files and keys;
convert fresh copies, compare exact values in explicit old/new units, record
counts, links, balances, schema markers and operational/recovery behavior.
Matching displayed strings alone is insufficient. On failure, fix conversion
and retry with another fresh copy, not by altering the original to pass.

Legacy REAL cannot always reveal original decimal intent. Stop on ambiguous
values or unexplained differences. Report differences caused by the new rounding
policy separately for owner review rather than declare automatic parity. No
customer data does not authorize deleting development databases or inventing
history. Future concrete ambiguities return to the owner without reopening
already settled general design choices.

Use the actual startup initializer, not an unused migration runner. Reject
unsupported old schema/client writers, serialize migration work and gate traffic
and background work until success. Only inert independently green foundation
work may integrate before coordinated schema/read/write/contract activation.
No active half-converted money producers or dual authoritative balances.

Before activation, prove the real plain/encrypted driver paths, focused
integration, exact cursors/reports, repeat/reopen/failure/retry and actual
backup/recovery behavior. A pre-transition snapshot is not lossless rollback
after new writes; document the cutoff and recovery procedure explicitly.
Current-head verification/protection/hosted review and owner approval gates
remain. No release/installer authorization follows from this contract.

## Evidence and remaining gate

Runtime research #521:
https://github.com/AmaraNecib/tuari_react_hono/blob/4f1c73d3b8c4edaad420d146dfc93c58392d666b/docs/research/exact-money-storage.md

Local council memo and reports remain ignored at `.scratch/reviews/522/`.
Bounded comparison design:
[522-decimal-library-comparison.md](522-decimal-library-comparison.md).
These support design decisions, not application conversion or current-head
acceptance. They must not be relabeled as proof of release readiness.

Next gate: all three fresh second-pass advisors must explicitly accept this
same corrected full contract and attached field map, carrying forward unchanged
first-pass conclusions and resolving their inventory/precision findings. That
satisfies the owner's explicit conditional full-Markdown acceptance; another
confirmation merely to make the owner read English technical prose is not
required. A material new financial policy outside the recorded answers still
returns to the owner. Record/link the durable approved ADR/spec under the
repository lifecycle, then resolve #522 and consider dispatching #523. Council
design acceptance does not waive implementation review, protection, current-head
CI/hosted review, actual rendered UI approval or release gates.
