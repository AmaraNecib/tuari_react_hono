# Project cost exact-contract surface

- Worktree: `D:/worktrees/tuari_react_hono/t3-951ca3d7-94103c2c81fb3797`
- Base: `53e431f1d63a89f300aec478b96a78693806a52f`
- Scope: only the original `ProjectCostSection` and its focused test.
- Verification: `focused-local / CI-final-pending`; high-assurance exact-money seam.
- Contract: unchanged #522. DZD-only amounts arrive as canonical decimal strings; approved salary rows are earning segments, not legacy payment splits.

## Interface and decisions

`ProjectCostSection` consumes the existing `useProjectCostQuery` result as `ProjectCost`. It displays `totalAmount`, `parts.*Amount`, row `amount`/`valueAmount`, `purchaseAmount`, approved salary `segmentId`, `days`, `amount`, and `approvedAt`. Monetary strings stay strings and render through shared `MoneyValue`/`formatExactMoney`; the UI does not sum rows or derive day rates. Material movement sign follows its `direction`, and quantity/unit-price data is displayed as received.

A/B/A salary rows remain separate under `segmentId`, with backend-approved amounts. The existing panel, cards, Arabic copy, RTL layout, parked-inventory distinction, empty actions, loading and retry states remain. Source markers, bars and share labels remain part of the existing UI. Their display ratios are computed from canonical strings using integer cents and BigInt; only the bounded 0–100 result becomes a number for CSS. Material quantities are grouped as strings, without numeric coercion. Unit prices render through `UnitPrice.parse(...).format()` plus the shared currency run, preserving four-place rate semantics. This adds the direct `UnitPrice` import from `@tuari/contracts`; coordinate the import allowlist with its owner rather than weakening it. No query adapter or interface seam moved.

## Proof and lessons

The focused component test pins distinct A/B/A amounts (`10000.01`, `20000.02`, `30000.03`) and day counts independently. Existing tests retain expense, stock, materials, parked assets, negative material, empty, loading, error and navigation coverage with exact-contract data at render time. Matching lessons applied: money stays exact; loading and error never become false zeroes. The local test fixture adapter only converts prior test literals into the new wire shape; production code has no legacy-contract fallback.
