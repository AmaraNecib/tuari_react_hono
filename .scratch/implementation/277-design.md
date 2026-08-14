# Issue #277 — Move debt sign helpers to `@tuari/contracts`, delete the web copy

Tier: **High-assurance** (debt financial calculations — a flipped sign is a silent
accounting bug). Base: `origin/develop @ 3c14490`.

## Problem

The debt sign convention (PAYABLE-negates: `+balance` on a PAYABLE account means
"we owe them" and contributes **negatively** to the party net; `+balance` on a
RECEIVABLE account means "they owe us" and contributes **positively**) is
duplicated byte-for-byte between API and web, plus a third inline copy:

| Copy | Location | Code |
|------|----------|------|
| 1 | `apps/api/src/modules/company/company.helpers.ts` `getDebtAccountNetContribution` / `getNetDebtBalance` | `direction === "RECEIVABLE" ? balance : -balance` |
| 2 | `apps/web/src/features/debts/debt-utils.ts` `getCombinedDebtBalance` | `direction === "RECEIVABLE" ? currentBalance : -currentBalance` |
| 3 | `apps/web/src/features/debts/debt-utils.ts` `getDebtAccountBalanceMeta` | inline `effectiveSign` flip (same convention) |

The API doc comment claims "keeping it centralized here means the API and web
agree" — but the web copy exists. Any future drift (e.g. a sign flip in one
copy) is a silent accounting bug. Re-verified against current develop
(`3c14490`, issue said `fd94c41`): all three copies still at the locations
above.

## Fix — single source of truth in `@tuari/contracts`

Move the sign **math** into a new contracts module and route every caller
through it. Contract schemas already share the pattern of pure-TS debt helpers
alongside schemas (`debtReasonCategoryDirectionMap`, `deriveDirectionFromCategory`
in `core.ts`).

### Public API (new module `packages/contracts/src/debt-helpers.ts`)

```ts
export type DebtBalanceAccount = Pick<DebtAccount, "currentBalance" | "direction">

// Sign-flips one account into the unified net perspective:
//   RECEIVABLE +balance → +balance ("they owe us")
//   PAYABLE +balance    → -balance ("we owe them")
export function getDebtAccountNetContribution(account: DebtBalanceAccount): number

// Sums contributions across a party's accounts (mixed PAYABLE/RECEIVABLE
// ledgers cancel instead of compounding). Empty list → 0.
export function getNetDebtBalance(accounts: DebtBalanceAccount[]): number
```

Exported from the package index (`export * from "./debt-helpers"` — the wisdom
lesson from #206: index export required for reachability).

### Dependencies

- `debt-helpers.ts` → `DebtAccount` type from `./debts` (no cycle: `debts.ts`
  and `core.ts` never import `debt-helpers.ts`).
- No runtime deps beyond what contracts already has (zod schemas untouched).

### Call-site changes

| File | Change |
|------|--------|
| `packages/contracts/src/debt-helpers.ts` | **new** — canonical helpers |
| `packages/contracts/src/debt-helpers.test.ts` | **new** — locks the sign convention |
| `packages/contracts/src/index.ts` | add `export * from "./debt-helpers"` |
| `apps/api/src/modules/company/company.helpers.ts` | **delete** `getDebtAccountNetContribution` + `getNetDebtBalance`; import `getDebtAccountNetContribution` from `@tuari/contracts` for `getDebtAccountBalanceLabel` |
| `apps/api/src/modules/company/finance.service.ts` | import the two helpers from `@tuari/contracts` instead of `./company.helpers` |
| `apps/api/src/modules/company/company.unit.test.ts` | import the two helpers from `@tuari/contracts`; existing sign tests now exercise the shared source through the API |
| `apps/web/src/features/debts/debt-utils.ts` | **delete** `getCombinedDebtBalance`; refactor `getDebtAccountBalanceMeta` to delegate its inline flip to `getDebtAccountNetContribution` (removes copy #3) |
| `apps/web/src/features/debts/debt-cases-panel.tsx` | `getCombinedDebtBalance(...)` → `getNetDebtBalance(...)` from `@tuari/contracts` |
| `apps/web/src/features/debts/debt-party-summary-card.tsx` | `getCombinedDebtBalance(...)` → `getNetDebtBalance(...)` from `@tuari/contracts` |
| `apps/web/src/features/debts/debt-utils.test.ts` | drop the `getCombinedDebtBalance` describe (behavior now locked in contracts test); `getDebtAccountBalanceMeta` tests stay (refactor is behavior-preserving) |

Deliberately **not** moved (out of scope): Arabic label helpers
(`getDebtBalanceLabel`/`getDebtAccountBalanceLabel` in API, `getDebtBalanceMeta`/
`getDebtDirectionLabel` in web) — UI/display concerns; after this change their
sign inputs all flow through the single contracts helper, so the math can no
longer drift.

## Dual-source drift test

No existing drift test for debts exists (searched `packages/`, `apps/`,
`tests/` for drift tests — hits are payment/rbac/bootstrap, unrelated). After
this change a drift test is **obsolete by construction**: there is exactly one
implementation of the sign math. The guard is the contracts unit test below plus
the deletion of all other copies (verified by `grep` for
`RECEIVABLE ? ... -currentBalance` patterns post-change).

## Planned tests

- `packages/contracts/src/debt-helpers.test.ts` (new, unit):
  - `getDebtAccountNetContribution`: RECEIVABLE keeps sign; PAYABLE flips.
  - `getNetDebtBalance`: empty → 0; single PAYABLE +2000 → -2000; single
    RECEIVABLE +500 → +500; mixed PAYABLE 2000 + RECEIVABLE 500 → -1500
    (canonical example from both legacy suites); RECEIVABLE > PAYABLE → positive;
    all-zero → 0.
- Existing suites keep passing: API `company.unit.test.ts` (sign tests now
  import from contracts), web `debt-utils.test.ts` (meta tests exercise the
  refactored path), finance service tests unaffected (pure re-import).
- No Playwright E2E: this is a pure refactor with no user-visible change;
  debt screens covered by existing component tests. Guard Phase 1 runs the full
  pipeline.

## Implementation risks

- **Stale contracts `dist/`** (wisdom, testing.md #488): `@tuari/contracts`
  resolves via `dist/index.js` — must run `pnpm --filter @tuari/contracts
  build` before API/web suites; `pnpm test:api` builds first, `turbo typecheck`
  also builds.
- **Missing index export** (wisdom, architecture.md #13): helper unreachable
  unless `index.ts` re-exports the module — covered by importing in the test.
- **Behavior drift in `getDebtAccountBalanceMeta` refactor**: same flip, now
  delegated; existing web tests pin the 5 cases (PAYABLE+/RECEIVABLE+/overpaid
  PAYABLE-/overpaid RECEIVABLE-/zero).
- **Module cycle**: avoided by `debt-helpers.ts` importing only types from
  `./debts`; neither `debts.ts` nor `core.ts` imports it.
- `finance.service.ts:507` `-account.currentBalance` is settlement-amount
  negation, not the net-perspective convention — left untouched.
