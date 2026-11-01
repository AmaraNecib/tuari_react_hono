# #450 micro-conservation design

## Scope

- Worktree: `D:/worktrees/tuari_react_hono/t3-b83e09ba`
- Branch: `agent/450-micro-conservation`
- Pinned base: `43b87b72c768d69012c73a0ae8076a1cfaa3bafc`
- Final implementation SHA: `b7b8062ad68bd98d7727d337efedaa5b24f3c01b`
- Tier: HIGH-ASSURANCE, inventory quantities affect stock and financial records
- Ownership: this worktree only. The parent owns independent review and publication.

## Decision

Keep allocation and `roundQuantity` unchanged. Add a local inventory helper that converts a normalized `Number` through its decimal `String(value)` representation into exact six-decimal `BigInt` units. It handles exponent notation and returns `null` for non-finite values or decimal representations that are not whole micro-units.

Before writing a stock change or movement for consumed quantity `q`, preserve the current finite, nonnegative, and strict-decrease checks. Also require both exact normalized ledger deltas:

```text
micro(balance) - micro(left) = micro(q)
micro(remaining) - micro(nextRemaining) = micro(q)
```

If either conversion is unavailable or either equality fails, throw `InventoryError` with `BUSINESS_RULE` inside the existing transaction. That rolls back earlier debt, stock, movement, transfer, and transfer-item writes.

This verifies normalized decimal quantities only. Allocation and normalization still use `Number`; it is not a general arbitrary-precision quantity implementation, and it adds no public magnitude bound.

## Tests

Use the real SQLite outbound-transfer service seam. Pin the two-row request mismatch at warehouse and project sources, with the six-micro row ordered before the large row by `createdAt`. Assert the row order, compare request and intended movement units with `BigInt`, and compare raw table snapshots after the transaction rejects.

Add the complementary stock-reverse-delta case for both source types. Its normalized stock delta is five micro-units while the movement is six; the old rounded binary reverse subtraction reports six. Assert `BUSINESS_RULE` and full rollback.

Keep the 13-row successful allocation and final-remainder rollback fixtures green. Assert movement-unit sums with exact `BigInt` conversion. Add helper tests for exponent notation, a whole micro-unit, a sub-micro value, and a non-finite input. Tighten the project wrong-source assertion to require `BUSINESS_RULE`.

No contract, schema, dependency, UI, or inbound-transfer changes are planned.
