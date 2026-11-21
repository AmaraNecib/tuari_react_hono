# Stock tab render loop

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-c09cbbd0-12a07eaff888a9c1`.
Base: `9c765c14f4326a6204143742c59e80529d6353ca`.
Mode: focused-local / CI-final-pending. High assurance because a reachable inventory screen crashes. Parent owns the fresh combined-delta review and browser recheck. No publication, contract, schema, money, locale or E2E changes.

## Reproduction and cause

Read the actual `trace.zip` under the sibling run's `test-results/inventory-transfer-invento-23bf6-lects-the-received-quantity-chromium/` directory. The browser stack is `forceStoreRerender` then `updateStoreInstance`, with InventoryLocationContentsSection in WarehouseDetailsPage. This is not a direct render setter.

The captured run used `03766c80e54decdace0ea384dab0613f5982750b`, November 20 23:12:04Z to 23:14:24Z. Its client binding, exact-commerce scope module and stock section are unchanged at this lane's fresh base. A new mounted regression at the fresh base reproduces the same Maximum update depth stack with the actual ORPC proxy, session hook, workspace gate and QueryClient. Only `rpcLink.call` is stubbed. Existing stock tests replace the client and session hook, hiding proxy identity churn.

ORPC 1.13.6 `createORPCClient` recursively creates a new proxy on each property read. Repeated `financialClient.inventory` reads therefore create different objects. `exactCommercePrefix` assigns each a distinct WeakMap scope. Query observers switch to new pending queries every render, producing new external-store snapshots and another render indefinitely. A fresh location object alone is not the cause: TanStack hashes its structural key, whereas the client scope is a new number every time.

## Minimal fix and interfaces

Bind each declared FinancialClient namespace once in `orpc-client.ts`. Keep the exact authenticated RPCLink, paths, inputs and outputs. The typed object lists the existing metadata, debts, invoices, inventory, expenses and reports namespaces. This shared binding is necessary because all exact-commerce callers rely on client identity, including invalidation and uncertain request IDs. A component-local memo would leave those callers reading different identities.

No seam moved. The transport adapter still implements FinancialClient; its namespace identity now matches its lifetime. The existing exact-commerce module retains owner/client partitioning and the pending-request registry. Deleting it would duplicate owner scope and idempotent retry behavior in callers, so retain its depth rather than refactor it.

Domain vocabulary is unchanged. Warehouse and project can share a textual ID but must remain distinct typed locations. Current stock is separate from asset history and financial amount strings. No glossary or ADR change is needed.

## Proof

The original one-case regression fails on the base with Maximum update depth exceeded through forceStoreRerender/updateStoreInstance, then passes with only the namespace binding changed. The final regression mounts the actual WarehouseDetailsPage and ProjectDetailsPage with their items tab. It checks async stock arrival, cached rerender without another fetch, opposite typed location with the same ID, delayed real session query, and transport failure/retry without presenting a failure as empty stock. Existing stock, asset history, movement forms, equipment, exact-commerce owner/retry and workspace/client tests remain affected proof.

No maximum-render suppression, disabled query, ErrorBoundary bypass, numeric fallback or selection rewrite. No current-head Chromium claim. Parent's E2E worker owns browser proof. Disk capacity was 522,076,160 bytes before affected checks; no browser or further build was attempted.

## Applied lessons and limits

Applied the canonical session query-key lesson and real-QueryClient mounted proof lesson. Applied the warning that a self-consistent mock can hide production cache failures. Excluded its historical full-E2E directive because current workflow and the parent's explicit scope require affected local proof. Dialog reset guidance remains unchanged and is covered by existing stock tests. No wisdom files changed.

Raw execution and exact-head evidence remain ignored under `.scratch/reviews/579-stock-render-loop/`. Typecheck initially found an incomplete session fixture; lint found an unused fixture argument. Both were corrected without changing production behavior. Hosted acceptance, protection enforcement and independent review remain parent-owned and pending.
