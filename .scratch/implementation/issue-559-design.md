# Issue 559 payment entry

## State and scope

Worktree: `D:/worktrees/tuari_react_hono/t3-0e4b1467-be3d2c82e07909f9`.
Base: `5b09d7213f5fd8d990a8b20cd3e5a80abdbca21f`, matching freshly fetched `origin/develop`.
Specification: https://github.com/AmaraNecib/tuari_react_hono/issues/559.
Verification mode: focused-local / CI-final-pending.
Review route: three distinct initial sessions, debate, test-audit, code-review. Money entry can cause a reachable overpayment or rounding error.

The issue says #558 blocks delivery. That issue remains open, but the current source already provides the connected payroll panel, authenticated cash mutation and durable pending-intent mechanism. Inspect their current API and persisted-balance coverage before treating the dependency as complete. Do not create a second payment writer.

## Proposed implementation

Extend `apps/web/src/features/employees/employee-payroll-panel.tsx` for ordinary earned-wage cash payments. Keep opening wages, advance repayment and advance offsets separate from the selected approved-earned percentage basis.

The basis is `selectedEarning.earning.totalAmount`, not `selectedEarning.remaining`. A payment percentage describes this payment only. A separate cumulative preview must account for prior settlement without mislabelling advance offsets as cash paid.

Keep exact money as the sole persisted amount. Convert percentage input using integer rational arithmetic and the accepted currency rounding contract. Derive the reciprocal display from the last explicitly edited field, without reciprocal effects. Mark rounded percentage displays as approximate. Quarter and half use approved-earned total; whole remainder uses exact current outstanding wages.

Preserve the existing explicitly entered advance amount and the foundation's bonus classification path. Do not silently classify an excessive wage payment. Keep frozen request identity and payload unchanged for uncertain retries, even after balances change. First-time confirmation must validate current outstanding wages; server-side atomic validation remains authoritative.

## Proposed test interfaces

The owner confirmed that issue-defined requirements need no further approval. The accepted interfaces are the real calculator, authenticated payment API and persisted balances, plus the connected form.

1. Exact calculator: 60,000 at 50 percent gives 30,000; round trips, fractional cents, malformed input, zero totals and excessive amounts use literal expected results.
2. Payroll form: amount and percentage editing, quarter/half/remainder, previous 20 percent plus new 60 percent, approximate displays, keyboard labels and RTL preview before submit.
3. Authenticated payroll API with persisted state: stale balance, duplicate submit, uncertain retry and reload retain the exact request identity and do not overpay or duplicate records.

Existing form tests are in `employee-payroll-panel.test.tsx`. The authenticated API regression is `apps/api/src/rpc/exact-payroll-auth.integration.test.ts`. The connected browser case in `tests/e2e/payroll-connected-exact.spec.ts` exercises percentage entry, an intercepted committed response lost in transit, another real payment, reload and identical retry, then a stale-balance refusal. Raw logs remain local; final exact-SHA verification follows the commit.

Display percentages allow six entered decimal places and show two derived places, marking non-exact ratios. Conversion uses integer rational arithmetic and half-away-from-zero currency rounding. These are input/display rules, not a new persisted-money policy. The preview distinguishes cumulative cash paid from cumulative settlement including advance offsets. Direct amount edits and shortcuts update money once; no reciprocal effect recalculates drafts.

The E2E selector returns full scope because Arabic resources are a critical path. Local proof remains limited to affected payroll cases because this change adds payroll keys only; full unrelated browser coverage remains CI-final. Compile contracts as a test prerequisite because package exports resolve generated dist, not TypeScript source.

## Local execution boundary

Dependencies were installed with `pnpm install --frozen-lockfile`, without package additions. No package additions are proposed. The Impeccable context script reports no PRODUCT.md; use existing UI conventions, without expanding this issue into product documentation. Its referenced `reference/product.md` is absent in this checkout.

## Architecture

Retain the existing payroll write and retry interfaces. A pure percentage calculator should own rational conversion and display approximation so integer money rules do not spread through event handlers. No schema, ledger, rounding-policy or published-contract change is proposed.
