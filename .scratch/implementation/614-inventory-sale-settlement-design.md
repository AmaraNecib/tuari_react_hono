# Issue 614: purchase and sale settlement

## Scope and authority

Recovery base: `dfe14ba1f30a95b8f61f0cddeae60e68bad83438`. It contains `origin/develop` at `9401180a21ef990fe7f9d5c8e0a43d39db440747`. Current worktree: `D:/worktrees/tuari_react_hono/t3-d6914c15-f374bbf6e605b09f`, branch `recovery/614-inventory-sale-settlement`. Merge base with `origin/develop`: `9401180a21ef990fe7f9d5c8e0a43d39db440747`.

Risk tier: high assurance. The change touches money, inventory stock, source attribution, authentication and restart recovery. Verification mode: `focused-local / CI-final-enforced`, based on effective ruleset `26837184` requiring strict `CI acceptance` from integration `15368`. The owner retains publication, hosted verdict and merge authority.

Implement settlement for purchase records and outbound SALE records only. Support warehouse and project origins, plus supported manual originals. Keep #613 opt-in; this work does not activate it. Exclude returns, gifts, default activation, #615, publication, issue closure and merge.

## Domain invariants

Settlement is a noncash offset between existing opposite-direction obligations. It is not a payment and must not change actual cash. It preserves source stock, locations, prices and project contributions; reversal atomically restores the prior obligation balances. Reject unsupported source kinds rather than mapping them to purchase or sale.

Inventory originals remain owned by their trusted producer. The debt API cannot void them, before or after settlement reversal. The trusted producer path refuses void while a settlement is live. No inventory cancellation or stock-restoration capability was added. This guard proof is not end-to-end inventory cancellation; reversal is only a prerequisite for cancellation that an existing supported operation can perform.

## Interface and proof plan

The existing #613 settlement contract remains opt-in. Purchase payables and outbound SALE receivables use the existing trusted inventory producer identity. Both mixed-direction pairings are covered: purchase payable with SALE receivable, and purchase payable with manual receivable; project SALE with manual payable is also covered. Source history links identify exact records. Debt account and tab state persist in the URL so browser Back restores the originating account history.

Outbound transfer history computes `paidAmountDzd` from live PAYMENT postings targeted at that source obligation. Settlement and other ledger postings do not count as cash. Invoice paid totals retain their existing actual-payment semantics.

Write failing tests first for eligibility, source-kind boundaries, atomic settlement and reversal, and preserved source values. Add focused adapter and connected-client tests at the existing finance/write seams. Settlement postings retain trusted inventory producer ownership; only purchase payables and outbound SALE receivables qualify. Purchase source remaining debt follows the ledger balance while paid cash stays unchanged. Outbound source reads derive remaining debt from the ledger. Do not infer proof from mocked services alone.

## Review and verification

The preserved original browser failure is at `.scratch/evidence/613-ui/run-ABu02T/artifacts/manual-settlement-connecte-9a216-gates-to-source-records-614/`. It showed that navigation lost the selected account and settlements tab after Back. The later connected pass is current worktree proof only; it does not replace that historical failure record. The imported handoff patch SHA-256 was `16da0edc6b9fd1b91b1fd2044b185a7c8009c6343005cbf8e52d5047b33564db` and contains eight preserved tracked changes.

Implementation and review-depth reassessment: source identity remains producer-owned; cash reporting derives only from actual live payments. Noncash settlement must not be treated as cash or as permission to mutate an inventory source through a ledger-only path. Review should focus on these boundaries and the public history navigation, not broaden into unsupported cancellation or stock restoration. Parent owns independent review, current-head hosted verdict and merge gates. No publication or #615 work is authorized.
