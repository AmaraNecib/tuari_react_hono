# Test Audit — issue #23 (Standard tier)

- **HEAD**: f90f9df (post-review fixes; evidence covers c4ee8df → f90f9df)
- **base**: 389336a
- **Scope**: dashboard-metrics.test.ts, dashboard-section.test.tsx, home-view-derived-composition.test.ts (+ reviewed home-view.test.tsx adaptations)

Three parallel agents (edge case hunter / coverage analyst / quality reviewer).

## Edge Case Hunter

**Verified present and correct:** empty/absent query data → zeros; OPEN vs
SETTLED debt partition (settled 4,000 excluded); OPEN zero-balance accounts
excluded; invoice "open" = `remainingDebtDzd > 0`; render test projects the
pure-builder values + pushed-through `counterparties`.

**Findings (all fixed):**
1. 🟠 Error states silently rendered as zero — `dashboard-section.tsx` read
   only `query.data`, so an erroring debts RPC showed "0 د.ج" (indistinguishable
   from a genuinely debt-free account). **Fixed**: `isError` → "—" placeholder,
   plus a render test asserting no fake zero on error.
2. 🟠 Loading flash `0` — pending queries claimed zero beside real counts.
   **Fixed**: `isPending` → "…" placeholder; the loading test now asserts 3
   placeholders and no "0 د.ج".
3. 🟠 `toLocaleString()` without locale is nondeterministic (Arabic-Indic
   digits / grouping varies by machine; test only passed under en-US default).
   **Fixed**: `toLocaleString("ar-DZ")` — matches the app-wide money convention
   (audit-log, location-transfer, outbound-transfer pages).
4. 🟡 Negative `currentBalance` on OPEN accounts would reduce the total.
   Not fixed: the debts module maintains positive-with-direction (`currentBalance`
   is stored positive; `direction` carries orientation) — same invariant the
   finance service relies on; defensive `Math.abs` would diverge from the
   accountOutstanding semantics it deliberately mirrors.
5. 🟡 No test pins card order/identity inside StatBand — the render tests
   assert labels + distinct values, which is adequate for the band.

## Coverage Analyst

Each acceptance criterion has a test: open-invoices filter (unpaid-only),
OPEN-only debt sum, item count, counterparties derived from snapshot
(composition test), inherited cards unchanged, i18n reuse. Tests are diverse
(pure builder + render + composition) not same-pattern. No duplicate coverage
found. Info: home-view.test.tsx sidebar assertion scoped to `[data-tour=sidebar]`
because the counterparties card reuses the same label; search-corpus gating
test moved to the projects page because the dashboard now legitimately mounts
the inventory/invoices queries.

## Quality Reviewer (grade: B+)

- Finding: `getAllByText("1")` collided openInvoices=1 with items=1 — a wiring
  swap would be undetectable. **Fixed**: distinct values (openInvoices=1,
  items=3), asserted individually.
- Finding: inherited card values partially unasserted. Addressed in the
  "inherited cards unchanged" test (workers=2, projects=3 asserted).
- Test names clear; no async-handling issues (lifecycle mocks are synchronous).

## Verdict

All 🟠 findings addressed; only 🟡/info items remain (documented tradeoffs).