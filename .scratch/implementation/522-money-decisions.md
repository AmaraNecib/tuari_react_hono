# Issue 522 money decisions

Status: individual interview decisions complete; final corrected full-contract
council acceptance pending under the owner's explicit conditional approval.
This chronological record preserves earlier open questions; later decisions
supersede them. The Remaining decisions section is current. This is not approval
to implement, migrate, publish, close #522 or release. #521 research is input.

## Confirmed in this interview

- V1 enables Algerian dinar only. The internal currency identity is `DZD`.
- Current UI displays the Arabic label `دج` only. Do not add French or another
  language as part of this scope. `DA` and `DZD` are labels/codes for the same
  currency, not separate currencies.
- The design must allow future currencies without rebuilding the financial
  system. This does not promise zero code changes or authorize FX,
  cross-currency settlement, or additional enabled currencies now.

The owner explicitly confirmed the display decision after correcting an English
sentence accidentally typed with an Arabic keyboard layout.

## Final monetary precision

The owner accepted two decimal places for final amounts on the condition that
this matches the currency standard. Verified against SIX's official ISO 4217
List One: DZD has `CcyMnrUnts` equal to `2`, numeric code `012`.
https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml

Final monetary amounts therefore use a DZD quantum of 0.01. This is a currency
precision decision, not a claim that every bank's intermediate calculations use
only two decimal places. Unit-price and invoice rounding decisions are recorded below. Other rate types
and precise intermediate representations remain open. Existing optional-decimal display is unchanged.

## Unit-price precision and signed rounding

The owner approved unit prices with up to four decimal places. Preserve the
entered price before multiplying by quantity. For example, 0.125 DZD times 10
is 1.25 DZD, not 1.30 DZD from premature unit-price rounding.

The owner approved automatic nearest rounding, with exact ties away from zero,
when a final amount needs two decimal places: 0.375 becomes 0.38, 0.374 becomes
0.37, and -0.375 becomes -0.38. Do not ask users to choose a rounding direction
for individual transactions.

Showing the exact calculation and rounded result was recommended. The owner's
suggestion supports transparency, but the exact UI remains undecided and needs
owner UI approval. Manual monetary adjustments, their permissions and audit
rules have not been approved by this conversation.

The owner explicitly selected invoice-level rounding after summing exact line
products, rejecting the assistant's per-line rounding recommendation. Two lines
of 0.375 DZD total 0.75 DZD, not 0.76 DZD. Do not round unit prices or line
products before computing that document's final amount. This establishes the
invoice calculation boundary, not a universal rule to recompute aggregates of
already-finalized documents from their unrounded intermediates.

Line products are intermediate values and may contain fractions smaller than
0.01 DZD. Their display and persistence, reconciliation with final totals,
partial settlements, and the scale of monetary rate fields beyond unit prices
still need decisions. Existing final-amount precision remains two decimals.

## Physical representation direction, subject to compatibility checks

The owner explicitly changed the earlier rejection of integer-cent persistence:
"yes but check if it's going to cause problems in our system, if there are any
side effects, or if it's going to simplify our work and make it consistent."
This approves investigating the proposed direction: integer cents for finalized
DZD amounts, separate integer unit rates in 0.0001 DZD increments, and exact
higher-precision intermediates. Users still enter and view DZD, not cents.
It does not approve implementation or complete the #522 financial contract.

The bounded compatibility audit reads current develop application source
`17d6277bee359a059d0af5d5befaa887446fae9b` from the existing #521 worktree.
Record: `.scratch/reviews/522/cents-compatibility-audit.md`. Nine executable
assertion groups passed, including selected existing helper behavior and a
standalone exact candidate calculation, not full integration. No application,
dependency or database changes. No fundamental incompatibility found in the
inspected paths, but this is not an exhaustive conversion proof.

Required follow-through includes eliminating early UI line rounding, handling
up to ten product decimal places for four-decimal rates times six-decimal
quantities, reconciling project allocations, unifying signed rounding, exact
wire/cursors and bounded SQL arithmetic, and a coordinated non-destructive
schema/read/write transition. Integer cents alone does not resolve these.

## Existing development data transition

The owner approved changing the schema while preserving existing data. Keep the
original unchanged, convert a fresh copy, and compare monetary values using
explicit old/new units, record counts, links, balances and operational/recovery
behavior. Matching displayed formatting alone is insufficient. Stop on ambiguous
REAL values or unexplained differences. Fix the converter and retry on a new
copy; never alter the original to make the comparison pass. Differences caused
by the new rounding policy need separate owner review, not automatic acceptance.
The owner approved the plan, not execution of a migration or deletion. After new
writes, an old snapshot is not a lossless rollback mechanism.

## Input precision and linked-document currency

The owner approved rejecting an entered unit price with more than four decimal
places, such as 0.12345, with a clear validation message rather than silently
changing it. Exact input grammar and equivalent trailing-zero handling still
need specification. Automatic signed rounding applies to computed results.

The owner approved payments inheriting currency from their linked invoice and
account, with cross-currency links rejected. DZD is the only enabled currency
and this introduces no currency picker now. The owner noted the policy could
be revisited in future; that is not approval of FX or future mixed-currency
payments. The specific multiple-invoice payment validates one shared currency.

After concrete salary-reference examples, the owner approved partial-update
semantics: an omitted property preserves its previous value; explicit NULL
clears a nullable optional field; explicit zero remains zero where permitted.
Required amounts cannot be cleared. Removing a salary reference does not remove
historical earnings, payments or debts. This is an update contract, not a mandate
to change RPC to HTTP PATCH or change existing business authorization.

## Missing, zero and reviewed states

The owner accepted distinguishing explicit zero from an unspecified optional
amount and rejecting a missing required amount. They then asked whether this
applies beyond opening balances. Scope clarification: the missing-versus-zero
rule applies to financial fields according to their contracts. It does not make
required fields optional, allow zero payments or require a review state on every
monetary record. Opening balance review is a separate domain state: unreviewed
is not reviewed-and-zero, and the existing nonblocking payment decision remains.
Do not reinterpret existing stored zeros as missing or change legitimate computed
zero defaults without an owner-approved transition. Omitted versus explicit NULL
update behavior is approved below; field-level validation and authorization remain required.

## Account currency ownership

The owner approved currency fixed on each debt account, with entries inheriting
that currency and mismatches rejected. Account identity is party plus ledger
direction plus currency. Current V1 uses DZD only; adding this discriminator
preserves the existing separate PAYABLE and RECEIVABLE accounts per party.
Future currencies require separate accounts. Do not introduce another debt
ledger, automatic netting, FX or cross-currency settlement. A displayed net is
informational, not automatic payment or cancellation of the separate balances.
Document/payment currency inheritance and cross-link validation still need to
be specified consistently with this account rule.

## Exact wire direction

The owner accepted the proposed direction after requesting assurance about
preservation: JSON monetary amounts use exact decimal DZD strings, such as
`"125.50"`, while finalized storage uses 12550 integer cents. Do not introduce a
binary-number conversion between parsing, computation, persistence and encoding.
Currency remains explicit or inherited under the ownership policy still to be
chosen. Canonical formatting, unit-rate/intermediate wire shapes and validation
limits are not yet fully specified. This is not a guarantee that existing REAL
values can disclose lost original precision or approval of a migration.

## Runtime proof received

Issue 521 completed as research, without a PR or integration merge. Published
asset at research commit `4f1c73d3b8c4edaad420d146dfc93c58392d666b`:
https://github.com/AmaraNecib/tuari_react_hono/blob/4f1c73d3b8c4edaad420d146dfc93c58392d666b/docs/research/exact-money-storage.md

The coordinator read this pinned asset. Both selected production factory drivers
proved exact signed int64 BigInt binds and statement-local reads on Windows x64
Node 22.23.2. Default numeric reads demonstrably lose digits. Initialization,
reopen, generic transaction rollback/retry and real worker snapshots with copied
recovery candidates passed. Keyed source/snapshots rejected wrong/no-key/plain
reads. This proves a candidate mechanism, not the owner's representation choice,
production conversion, full restore orchestration, other targets or release.

Receipt of #521 alone did not approve integer-cent persistence. The owner's
later conditional approval is recorded above and supersedes the earlier refusal.
No successor implementation is authorized by receipt of this research.

## Debt wording discussion, not financial ownership approval

The owner prefers Algerian wording: `نسالوه` means the party owes us,
`RECEIVABLE`; `يسالنا` means we owe the party, `PAYABLE`. Formal equivalents
are `مستحقات لنا` and `مستحقات علينا`. The owner approved Algerian labels by default, with a Settings option to use
the formal Arabic equivalents. Both modes have a visually small question-mark
help icon next to the term, aligned slightly above its baseline, not directly
above the word. Help text is `هو مَدين لنا، ونحن نستلم منه` for receivable and
`نحن مَدينون له، ونحن ندفع له` for payable. Provide a comfortable hit target
and hover, keyboard-focus and touch access. This is approved design direction,
not implementation or merge approval; the rendered UI still needs owner review.
It does not answer the currency ownership/uniqueness question.

Current develop inspection found formal labels in
`packages/contracts/src/debt-helpers.ts` and
`apps/web/src/features/debts/debt-utils.ts`; no matching terminology preference
was found in the inspected preferences directory. The owner-authorized factual
consultation was sent to thread `ef6bcd05-6dbd-4dac-972b-a019fe1397d2`; its reply
is pending. Do not claim that a proposed setting already exists.

## Allocation of finalized amounts

The owner approved deterministic remainder distribution for automatic allocations
of a finalized amount. Example: 100 DZD split equally across three projects
becomes 33.34, 33.33 and 33.33, preserving the full 100 DZD. Do not silently
rewrite manually entered allocations. Exact tie ordering, signed reversals and
partial allocation invariants must be specified consistently before implementation.

## Allocation identity and partial payments

The owner approved item 2: automatic allocation ties follow the recorded split
order, not a later display sort. In an equal three-way 100 DZD allocation, the
first recorded line receives 33.34 and the others 33.33. Reversals negate the
recorded allocation rather than redistribute its remainder.

The owner approved item 3: partial payments apply to the finalized invoice total.
For a 0.75 DZD invoice, paying 0.25 leaves 0.50. Payment does not recalculate
line unit prices/products or introduce line-based settlement in this scope.

The owner approved item 1 after the operational example: when a purchase is
agreed as 300 units for 10000 DZD, the entered group/line total is authoritative.
Preserve original amount and quantity for derived pricing rather than truncating
10000/300 to four decimals and recomputing 9999.99. When an entered unit price
is the agreement, derive the total from that price and quantity instead.

The owner confirmed a common workflow: negotiate an initially calculated total
such as 10050 DZD down to an agreed 10000 DZD. This is an intentional commercial
change to the agreed total, not automatic mathematical rounding to currency
precision. Do not generalize it into silently rounding all amounts to convenient
whole numbers or implement a new discount subsystem without agreed scope. Final
recording must consistently use the agreed amount in invoice, payment and debt.
Existing authorization and finalized-document edit restrictions remain intact.

## Bounds and derived-rate interview status

The suggested arbitrary ceilings of 10^12 DZD per operation and 10^15 DZD for
aggregates were not approved. The owner wants as much supported range as practical
and requested examples. Do not record those suggested ceilings as requirements.
Derived rates kept as exact ratios also remain under explanation, not approved.

## Owner-approved BigInt-first direction

After the three-advisor council and executable decimal-library comparison, the
owner explicitly answered yes to adopting the council's BigInt approach. Use
exact decimal-string input, private BigInt coefficients from the start, scaled
integer finite products, separately scaled entered unit prices and checked int64
finalized persistence. Retain original source ratios only where division needs
it; do not build a universal rational framework or late-promote from Number.
No new decimal runtime dependency is selected. Wire values remain exact strings.

This approves the engineering direction, not execution of the conversion or
completion of unresolved #522 financial semantics. The council's reversal-safe
range and resulting-balance checks must be specified in the final contract;
do not claim that driver range alone guarantees every workflow.

## Engineering council result

Owner-authorized council completed one independent pass, three of three advisors:
two pi/openai-codex/gpt-6-luna and one pi/openai-codex/gpt-6.1-sol, all thinking
medium, fresh context and read-only. Same model family disclosed. All recommend
BigInt from exact input, scaled integers for finite products, local source ratios
only where division requires them, and a small shared money interface. No material
disagreement justified cross-examination; stop rather than repeat for polish.
Local memo: `.scratch/reviews/522/council-memo.md`, with reports/run IDs beside it.

The council found that full signed int64 is not closed under reversal: negating
-9223372036854775808 exceeds int64. Recommend a symmetric persisted domain of
+/-9223372036854775807 minor units, per-field sign rules, and atomic checks on
resulting balances. Parent independently verified the endpoint arithmetic.
Application BigInt intermediates/reports can be wider than storage, but must not
flow through overflowing SQL arithmetic or unlimited/unvalidated input.

The council recommendation was advisory and the owner subsequently approved
the BigInt-first direction above. Detailed financial limits and unresolved
financial semantics still need a completed contract. No implementation, migration,
new dependency, successor issue launch or #522 closure is authorized by the council.

## Executable library comparison

At the owner's request, compared the proposed integer approach with already
installed `decimal.js@10.6.0`, a locked jsdom test dependency, without installing
or declaring a runtime package. Design asset:
`.scratch/implementation/522-decimal-library-comparison.md`.

Both BigInt and decimal.js at experimental precision 50 passed 13 selected
amount scenarios. Default precision 20 passed 12/13, losing a cent in a report
total much wider than persisted int64. The library wrapper was shorter, but
its precision context still rounds operations. Both tested decimal contexts
changed a final half-cent result if a nonterminating derived rate was cached
before later arithmetic; preserving source ratio operands avoided that loss.
This is not a library bug or evidence that decimal.js cannot support money.

Recommendation remains the small BigInt-first design for the agreed scope.
This is a bounded prototype comparison, not a production correctness or
performance proof. The owner subsequently confirmed the BigInt recommendation above.
No dependency, application schema or data changed. Adding the library later
requires direct runtime declaration and package vetting, not transitive imports.

## Final input precision and intermediate display

The owner approved both final-round proposals. An entered finalized amount with
more than two decimal places, such as 100.005 DZD, must be rejected with an
explanation instead of silently rounded. Automatic rounding applies to computed
results at the approved finalization boundary.

Show sufficient intermediate precision to explain the result: two 0.375 DZD
lines can visibly total 0.75 DZD. A nonterminating derived unit price may display
approximately, such as `≈ 33.3333 DZD`, while retaining exact original operands
and the agreed 10000 DZD total. Approximate display must not feed back into
persistence or arithmetic. This is design approval, not a substitute for actual
rendered UI approval before merge.

A consolidated contract draft is recorded in
`.scratch/implementation/522-exact-money-contract.md` for final owner confirmation.
Do not close #522 or start #523 until that confirmation and the required durable
publication/recording steps are complete.

## Final council pass 1 and rate classification

The owner explicitly delegated full-Markdown acceptance to the council: if the
advisors accept the file, the owner accepts it. This supersedes requiring another
confirmation merely because the owner did not read the English technical file.
It does not authorize financial policy added beyond the agreed choices.

Pass 1 read the entire contract at SHA256
`8caeff40b40a72855634565d706dcdfc15263baa9f78903db64a27bbe4e21837`.
Arithmetic accepted without findings. Authority and integration required the
missing complete monetary-field classification before acceptance. Three advisors
used fresh sessions of pi/openai-codex/gpt-6-luna, thinking medium; independence
was separate-session, same-family, not cross-family. No second pass yet.

Parent completed a static classification against actual writers/readers:
`.scratch/implementation/522-money-field-classification.md`.
A focused zero-dependency assertion verified exactly 27 unique columns across
17 initialized tables, each represented once. Counts: 20 final-amount columns,
two salary-reference/history columns, three unit/derived-price columns and two
exact-line/agreed-total columns. Raw check:
`.scratch/reviews/522/field-classification-check.json`.
No application/database/dependency was changed or runtime suite executed.

One concrete remaining owner decision emerged: an explicitly entered DAILY wage
is economically a rate per working day, unlike a final salary payment or monthly
reference. The input currently accepts arbitrary decimals, but the shared
proposal helper prematurely normalizes it to cents. Neither inconsistency
establishes the intended new policy. Ask whether DAILY input permits two or four
fractional places. If two, reject excess precision; if four, multiply the exact
rate over whole days before finalizing the two-place payment/proposal.
Derived monthly day rates and payment-based report day rates remain exact source
ratios regardless of this input decision. Do not broaden salary policy or views.

## Owner answer: explicitly entered daily wage

The owner described the actual workflow: manually entered daily wages are
normally whole DZD amounts such as 1250, 1200 and 1300; a day rate calculated
from a weekly/monthly agreement may contain decimals. They do not want the
system to add decimal places to a whole-number daily entry. They do not see a
routine need for fractional daily entries, but explicitly chose option 2 (up to
four fractional places) if the system permits them.

Exact owner wording: "I don't think that we need to let him enter decimal
numbers but if we are going to let him do that, I will choose option 2."

Recorded implementation direction, stated back to the owner: accept whole DZD
entries normally, allow up to four fractional places for an explicitly entered
DAILY wage when needed under option 2, and never force decimals into display or
invent them in arithmetic. No new fractional-entry preference/settings feature
is requested. MONTHLY and legacy WEEKLY references remain agreed period amounts
at two places; deriving a daily rate from them keeps exact source operands.
Whole-day quantity rules and existing salary-period availability are unchanged.

They also described pragmatic small differences (10/20/50/100 DZD) being agreed
away or rounded up. This contextual practice does not authorize an automatic
whole-DZD/10/50/100 rounding threshold or silently extinguish an unpaid balance.
Keep computed/proposed and explicitly agreed/actually paid values distinguishable;
any additional salary difference/ledger policy stays outside this precision
choice and must not be invented by the conversion.

This resolves the concrete DAILY-input precision frontier for the second council
pass; reviewers must assess the stated interpretation against the owner's exact
qualification rather than claim a requirement to enter fractional wages.

## Remaining decisions

No known monetary-field category is left unclassified after the 27-field audit
and the owner's DAILY-input answer. Technical schema/adapter implementation,
canonical codecs, resource limits, exhaustive caller conversion and execution
proof remain implementation work under the explicit contract, not permission
to invent additional financial policy.

The corrected full contract and field map require the final council's second
pass. All three explicit accept verdicts on the same version satisfy the owner's
conditional acceptance. If a genuine additional financial choice is discovered,
return it to the owner. Publication/closure, successor dispatch, actual UI merge
approval and release acceptance retain their separate gates.
