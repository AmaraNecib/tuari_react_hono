# Exact debt report reader

Base: c428d3abb48c86c7e18c206eaada40990900221c.
Worktree: D:/worktrees/tuari_react_hono/t3-48555dfb-145e2166ebf37ba1.
Verification: focused-local / CI-final-pending. High-assurance because exact aggregation, LIVE history and date membership can misstate debt.

## Interface and authority

`new ExactDebtReportReader(new SqliteExactDebtReportSnapshot(db, lock, financeRepository), now).generate({ startDate?, endDate? })` returns the legacy DEBT report shape with canonical decimal-string money. The standalone contract is not barrel-exported. Parent composition owns namespace mounting, contract exports and web consumers. This lane changes no root, router, legacy report, schema or financial writer. No publication or independent review is claimed.

The adapter verifies repository connection/FIFO identity. A synchronous FIFO-owned deferred SQLite transaction encloses counts, ledger reads, names and projection. Existing repository transactions join through nested savepoints. No await or second connection occurs during a report. Counts reject more than 10000 accounts or entries, including void history, before any row hydration. This follows the foundation's report-call budget rather than truncating to a plausible prefix.

## Vocabulary and preserved semantics

A report window selects accounts with at least one LIVE entry in the inclusive window. It does not reconstruct historical balances at endDate. All LIVE signed postings determine the current balance, including producer originals, payments, corrections and noncash settlements. VOIDED postings do not participate. Cached REAL columns and receipt reconstruction are not sources.

OPEN means nonzero current signed balance. SETTLED means zero. Settled money is the absolute total of LIVE SETTLEMENT postings only, and only for currently settled accounts. Cash payments alone do not populate that field. Both account directions contribute without direction-based netting, as in FinanceService.generateDebtReport. Party identity includes party type and ID. Signed negative originals remain signed in the additive contract; they are not silently reclassified into another account direction. This is necessary for the exact ledger's allowed negative obligations.

Aging uses the oldest LIVE posting and the existing whole elapsed-day calculation. EndDate is the aging reference when supplied. Day 60 enters both overdue and the 60+ bucket. No due-date field is invented. One injected now value supplies generatedAt and the fallback aging reference. Latest PAYMENT drives daysSinceLastPayment, with latest LIVE activity as fallback. Party sorting compares BigInt amounts, then Arabic names. Top debtors uses descending exact outstanding, capped at ten.

## Module depth and proof

The reader hides wide accumulation, party merging and aging behind one generate method. The concrete SQLite adapter hides transaction ownership, resource checks and name projection. It uses the established finance repository for validated exact INTEGER reads and does not add a generic all-entry ledger interface. Deleting this module would move snapshot and report logic into each caller; the seam earns its depth. Wide output formatting cannot use bounded persistable Money construction; only inputs use Money validation, and all accumulation uses private BigInt.

Native tests initialize actual fresh schemas and actual createFinancialDependencies on file-backed plain and keyed factory drivers. They cover amounts beyond JS safe cents and totals beyond stored int64, both directions, worker names, exact sorting, partial cash payment, producer originals, corrections, noncash settlement, voids, 59/60-day inclusion, empty windows, signed originals, current-not-as-of semantics, shared FIFO refusal, identity mismatch and account/entry budget refusal before hydration. Serialize-before/after asserts no reader writes. Schema tests reject numeric/noncanonical money and permit wide totals. A deliberate day-60 off-by-one mutation fails the dedicated assertion and is restored. Existing legacy report tests are selected without modifying their numeric-overflow expectations.

## Wisdom and remaining gates

Applied the aging-buckets lesson: overdue and the last bucket share day 60. No wisdom files are written by this worker. Parent-owned architecture review, all three independent local lenses, namespace composition, current-head CI and effective protection remain separate gates. No full #558 acceptance or release claim follows from this bounded reader.
