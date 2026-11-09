# Expense revision ordering

Worktree: `D:/worktrees/tuari_react_hono/t3-cb73cfda`
Base: published PR base `a7e8ec86247638ae4c06e48ce47f6b79bfcfb80a`; fetched `origin/develop` at `4917fd2cc733be63e21cf3e61d57a9ed7627b7e9` for freshness check. The fetched develop commit is the PR merge base, not an ancestor of this isolated branch.

Review tier: High assurance. Expense revisions record changes to money and related attribution.
Verification mode: `focused-local / CI-final-enforced`, as supplied by the parent. Parent owns any protection and CI acceptance checks.

## Contract and diagnosis

The test's `[45000, 46000]` expectation is correct. Revisions describe successive edits, so callers need ascending semantic edit order. The in-memory adapter orders `createdAt ASC, id ASC`; the SQLite adapter does the same. The `get` module returns that list without reordering. There is no expense-history UI consumer in the current source tree, but this is part of the module's observable history response.

The SQLite failure occurs when two edits receive the same millisecond timestamp. UUIDs are random, so `id ASC` may reverse the actual edit order. This is not a test-only issue: the in-memory adapter has insertion order for ties, while SQLite does not. Do not sort returned values in the test or change historical rows.

Fix at the service: while the per-repository transaction lock is held, ensure each new revision timestamp is later than the latest stored revision timestamp. Use wall-clock time when it is later; otherwise advance by one millisecond. This preserves the existing schema and rows. A deterministic SQLite integration test freezes the clock to make both edits tie without the guard.

## Scope and proof

Expected source changes: expense module and real-SQLite regression test. Run the focused SQLite and in-memory module tests plus relevant lint/typecheck. Preserve money field and audit assertions. No schema migration, broad cleanup, publication or parent review is included.
