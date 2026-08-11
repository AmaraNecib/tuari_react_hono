# Test audit evidence — issue #289 (payment validation)

**Tier:** High-assurance
**Base:** `bb144f3` **Head:** `1fc8859`
**Run:** three parallel `reviewer` sub-agents — edge case hunter, coverage analyst, quality reviewer — on the 4 changed test files + source.

## Verdicts

- **Edge case hunter:** core acceptance criteria correctly pinned. One wire-reachable 500 found → FIXED (see below). Three subtle/pre-existing gaps deferred → issue **#336**. Grade: solid with one fix.
- **Coverage analyst:** every acceptance criterion covered at all three strata (module seam in-memory, real sqlite adapter, black-box wire gate); tests diverse; no meaningful duplication.
- **Quality reviewer:** Grade **A** — behavior-descriptive names, no missing awaits, meaningful (non-tautological) assertions, per-test isolation, DB-level row-count truth.

## Findings → actions

### Fixed

1. **🔴 Fractional page limit crashes sqlite list — wire-reachable 500 (NEW).** `paymentListLimitSchema` accepted `2.5`; sqlite `LIMIT ?` throws `SqliteError: datatype mismatch` (verified empirically); the `paymentsList` handler only maps `PaymentInvalidLimitError`, so the raw SqliteError escaped as 500. Invisible to the in-memory suite (it only compares `length > 2.5`).
   - Fix: `.int()` on `paymentListLimitSchema` — closes at BOTH enforcement points (wire gate + module seam). Tests: contracts primitive test, module-seam `listPaged({ limit: 2.5 })` → `PaymentInvalidLimitError`, wire-gate `paymentsList({ limit: 2.5 })` → BAD_REQUEST.
2. **🟠 Unsafe-integer amounts pass.** `paymentAmountSchema` accepted `2**53`+; the strict `!==` sum check outcome becomes arbitrary past 2^53 and REAL columns lose precision.
   - Fix: `.max(Number.MAX_SAFE_INTEGER)` on `paymentAmountSchema` (both enforcement points). Tests: contracts primitive test + module-seam `totalAmount: 2**53` → `PaymentInvalidAmountError`.
3. **Quality note:** the zero-total module test combined bad total AND bad allocation — isolated to a total-only shape (positive allocation) so the total-only path is pinned.
4. **Coverage note:** contracts had NO direct tests for the payment schemas — added primitive tests (non-positive/non-finite/unsafe-int amounts; int limit incl. NaN/Infinity; default limit 50 still enforced).

### Deferred → issue #336

- 🟠 Cursor/sort-field type mismatch silently pages wrong (adversarial-only, two adapters disagree)
- 🟡 Duplicate payment id → raw SqliteError 500 (reachable via client-supplied id)
- 🟡 Fractional amounts + strict sum check reject mathematically-equal splits (DZD integer-based, low impact; epsilon comparison rejected as weakening the money check)
- 🟡 `deleteIfUnallocated` cannot join an outer transaction (unreachable via module today)

### Dismissed

- 🟡 In-memory adapter can orphan allocations mid-create under concurrency — documented divergence (pass-through `runInTransaction`), test double only, pinned as documentation not behavior.
- 🟡 Error precedence (`{total:0, allocations:[]}` → InvalidAmount before EmptyAllocations) — intentional, both BAD_REQUEST.

## Verified-correct (no action)

NaN/±Infinity/−0 rejected by zod `.positive()`; limit 0/−1/101, empty allocations, zero/negative total and allocation amounts pinned at seam + wire; duplicate-invoiceId grouped capacity with exact-cap `>` boundary; atomic delete NOT_FOUND/HAS_ALLOCATIONS(exact count 1 & 2)/DELETED at repo + module, plus cross-connection BEGIN IMMEDIATE write reservation; all bad-cursor shapes fall back to the full list.

**Runs:** 76 → 78 payment/router tests green; contracts 123 → 126 green; module coverage 100% stmts/branches/funcs/lines.
