# Issue 528 exact expenses page lane

## Pin and authority

- Worktree: `D:/worktrees/tuari_react_hono/t3-c448fe28-1912bd3dd4133566`
- Base: `1e3bd939d2f2578c3da178b12112dc5d3f086965`
- Scope: opt-in exact expense list, KPI totals, project groups, details and revision history. Numeric `ExpensesPage` remains the default.
- Verification: `focused-local / CI-final-enforced`; parent owns integrated proof, hosted review, CI and publication. No production activation.

## Domain and module seam

A finalized expense amount is a canonical exact DZD decimal string; aggregate totals may be wider display-only strings. Voided records remain visible but are excluded from totals. A revision with no previous amount displays unavailable, not zero. The page will share list/filter rendering and state across numeric and exact modes, with mode-specific query/form adapters. Exact mode passes strings only to shared `MoneyValue` or `formatExactMoney`; it never converts money through `Number`.

The actual interface is `ExactExpensesPage({ projects, employees, sellers, client })`, using the exact list/get/create/update/void hooks and exact form dialog supplied by the parent integration. The existing `ExpensesPage` interface and numeric hooks remain unchanged. The new exact detail dialog is reachable from both grouped and tabular rows.

## Review and proof

- Tier: high-assurance; exact financial display, lifecycle history, and void interaction have reachable user-facing failure modes.
- Verification mode: focused-local / CI-final-enforced, as assigned. The inherited baseline covers the financial contract; this lane adds UI behavior only.
- Tests target the page's public rendering and user interactions with literal huge/fractional amounts, grouping preference, filters/KPI states, voided visibility, nullable revision history, and failed-void retention.
- No architecture seam moves beyond adding an opt-in adapter to the existing page. No production route or shared component changes.

## State boundary

This commit is an implementation lane over the owner's authorized shared stack. Missing exact query/form source in this worktree is an integration dependency, not permission to alter their files. Parent integration must run affected tests/typecheck and current-head review. Hosted approval and CI remain pending.
