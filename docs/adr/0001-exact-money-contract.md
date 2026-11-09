# Use exact source operands and scaled BigInt for V1 money

Status: accepted by the owner through the recorded full-document approval
condition. All three independent advisor sessions accepted the same corrected
contract and field map without material findings. Their separate sessions used
the same model family; this is design acceptance, not a cross-family or
implementation review claim.

V1 money uses DZD-only accounts, exact decimal-string transport, private BigInt
arithmetic and checked reversal-safe int64 minor units for finalized amounts.
Entered unit prices and optional fractional DAILY wage references permit four
places. MONTHLY/legacy-WEEKLY reference amounts use two. Preserve exact source
products/ratios and authoritative agreed totals; finalize document sums once,
nearest with ties away from zero. A decimal library was considered but not
selected for this bounded scope.

## Authoritative approved artifacts

The complete contract and field-by-field map are the normative decision, not
just the paragraph above:

- [Exact-money contract](../../.scratch/implementation/522-exact-money-contract.md),
  SHA256 `c568f9c6fc214494c0f7cd96d96a6d11ceb08060bc39e989bfd43e0096a33927`.
- [All 27 monetary columns across 17 tables](../../.scratch/implementation/522-money-field-classification.md),
  SHA256 `9e0525638000e8c111891803b538cfd1d2619237c3b919e784d5fbef2bb8039a`.
- [Owner interview decisions](../../.scratch/implementation/522-money-decisions.md),
  SHA256 `190a7a712f49db64eaab273a4d84f614d56ab7e0415f844ae7860be3855866ed`.

These artifacts are preserved byte-for-byte as read by the final council.
Their pending-review status sentences describe the time of that frozen review;
this acceptance record supersedes those status sentences only. Earlier open
questions in the chronological interview are superseded by its later answers
and current Remaining decisions section. The owner is not required to reread
English technical prose to confirm the same already accepted content.

## Consequences and authority boundary

The scope is app-wide. Keep missing, NULL, zero and opening review distinct;
keep currency fixed on each account and inherited by entries; preserve allocation
remainders and reverse recorded allocations. An entered agreed line/group total
is not recomputed from an approximately displayed unit price. Whole-number
DAILY wage entry remains normal, with optional precision rather than forced
decimals. Informal small salary differences do not authorize automatic write-off.

Original development databases and keys are preserved. Rehearse on fresh copies,
reconcile exact values and relationships, stop on ambiguous legacy intent, and
gate actual startup before financial writers. A pre-transition snapshot is not
lossless rollback after new writes.

This ADR completes the owner decision requested by [#522](https://github.com/AmaraNecib/tuari_react_hono/issues/522),
using the production-driver feasibility research in [#521](https://github.com/AmaraNecib/tuari_react_hono/issues/521).
It unblocks consideration of the inert foundation in [#523](https://github.com/AmaraNecib/tuari_react_hono/issues/523),
not schema activation or implementation acceptance. Exhaustive caller conversion,
focused execution proof, current-head local/hosted review and CI/protection,
actual rendered UI approval, recovery and release gates remain separate.
