# Debate — Issue #251 (Coverage 100%: company/debt/finance, high-assurance)

- Base: `fd94c413846934e8722aa098f130e3a5bf9db1c6`
- Head: `3eac0f8` (post-evidence delta: debate fixes were committed as 9970498; final evidence rename)
- Tier: High-assurance (money-path modules per parent #248)

## Verdict

**No blockers.** Both critic and defender confirmed the coverage claim by
running the suite: 100/100/100/100 statements/branches/functions/lines across
workforce/invoice/auth/company (880 tests).

## Critic findings and dispositions

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| 1 | 3 | Consolidate live-count guards read outside `withTransaction`; deleted recompute loop was self-healing for a hypothetical concurrent-writer scenario | **Fixed** — moved both live-count guards inside the transaction so the "no other live entries" invariant is read-consistent with the voids. Single-connection better-sqlite3 already serializes; this makes the remainder-entry math provably correct. |
| 2 | 3 | Adapter relocation reduces the measured surface (844-line sqlite-company.repository.ts now excluded by the `**/adapters/**` policy) | **By design** — matches parent #248 policy ("Adapters are excluded from coverage") and the #209 layout convention. The adapter stays fully exercised by `sqlite-company.repository.test.ts`. Documented in the design doc + PR. |
| 3 | 2 | `paymentMethod: input.paymentMethod` could persist NULL from non-zod callers | **Fixed** — restored the service-layer `?? "CASH"` default by widening the service input type (`Omit<...> & { paymentMethod?: ... }`); added a test proving the default. |
| 4 | 2 | ACCOUNT_UPDATED label fallback chain shortened | **Dismissed (false alarm)** — `currentAccountLabel = resolveActorLabel(entry.userId)` is always a string (userId NOT NULL), so the removed `?? entry.phone ?? entry.userId` tails were unreachable in the old code too; display behavior is unchanged. |
| 5 | 2 | `primaryEvent` trailing `!` relies on the gate/matching-set sharing one predicate | **Dismissed (documented)** — the shared `matchesFilters` predicate IS the invariant; the removed `sortedEvents` fallbacks were the divergence bug. A comment documents the coupling. Reintroducing defensive fallbacks would weaken the correctness guarantee. |
| 6 | 1 | `resolveActorLabel` map not narrowed + double lookup | **Fixed** — narrowed to `Map<string, string>` and switched to a single `get()` + `!== undefined` check. |
| 7 | 1 | Consolidate returns the voided entry as success payload | **Dismissed (pre-existing)** — unchanged by this PR; noted for follow-up. |
| 8 | 1 | Guard-vs-transaction placement | Absorbed into #1. |

## Defender highlights (agreed)

- Adapter move is a clean 99%-similarity rename; only import paths changed; no stale imports remain.
- System-log filter unification fixes a **real** correctness bug: the old group gate compared dates with raw string operators while the matching set used `compareTimestampsDesc`, so a group could pass the gate while every event failed the timestamp filter, and the old `sortedEvents` fallbacks then surfaced a non-matching primary event (date filters bypassed). Verified with concrete date-only filter examples.
- `DEBT_ACCOUNT_CREATED` was never emitted anywhere (grep-verified) — removing its find is behavior-neutral.
- Finance consolidation dead-code removal is bit-identical: guards guarantee zero other live entries at the void point, so `reduce` always returned 0 and the recompute loop was a provable no-op.
- `assertDebtEntryDateNotBackdated` widening and the `?? "CASH"` removal are trivially safe (zod default + nullable column).

## Actions taken

Committed after this review: paymentMethod default restoration + widening,
Map narrowing, and in-transaction live-count guards (see HEAD `0461cec` diff
for follow-up commit after debate evidence).

## Residual risks (documented for PR)

- Adapter regressions are invisible to the coverage thresholds (policy-accepted).
- Multi-process/WAL concurrency on the debt ledger is not hardened (out of scope; single-connection deployment).
- Pre-existing `!` on `consolidateDebtEntries` success payload (voided entry returned).
