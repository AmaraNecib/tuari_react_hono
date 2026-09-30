# Debt terminology design — adopt unambiguous Arabic debt terminology

- lane: fix-debt-terminology
- worktree: `worktrees/fix-debt-terminology`
- branch: `fix/debt-terminology`
- base ref: `develop`
- base SHA: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
- mode: remote (parent owns push/PR/merge)
- review tier: Standard (UI + API + shared contracts + i18n)

## Problem

The existing labels `لنا عنده` / `علينا له` are directional but collide with
the signed balance. A `-50,000` balance on a PAYABLE account is rendered as a
bare negative number next to a phrase that can then read as the opposite
direction. Users cannot tell who owes whom.

## Terminology (authoritative, from the owner's accountant)

Direction labels:

| Account direction | Arabic |
| --- | --- |
| PAYABLE | مستحقات علينا |
| RECEIVABLE | مستحقات لنا |

Balance states (direction, signed balance):

| State | Input | Arabic |
| --- | --- | --- |
| owedByUs — we owe them, unpaid | PAYABLE, `> 0` | مستحق علينا |
| creditWithUs — we paid them more | PAYABLE, `< 0` | رصيد مستحق لنا |
| owedToUs — they owe us, unpaid | RECEIVABLE, `> 0` | مستحق لنا |
| creditWithThem — they paid us more | RECEIVABLE, `< 0` | رصيد مستحق لهم |
| settled | any, `0` | مسوّى |

Aggregate/net balances have no direction; positive → `مستحق لنا`, negative →
`مستحق علينا`.

Buttons: `تسجيل دفعة` (record payment), `تسجيل دين` (record debt).

Forbidden standalone UI labels: مدين، دائن، لنا عنده، علينا له.

## Display rule

The signed balance stays internal. Every rendered debt balance shows a
**positive** amount plus the phrase that states the direction. Zero renders as
the settled phrase `مسوّى`, never `مستحق علينا 0`. Movement deltas
(`signedAmountDzd`, ledger `المبلغ`) are transactions, not balances, and stay
signed — but every *balance* column/card obeys the rule.

## Public surface

`@tuari/contracts` (`debt-helpers.ts`, the existing single source of truth for
the sign convention — issue #277):

```ts
export type DebtBalanceState =
  | "owedToUs" | "owedByUs" | "creditWithUs" | "creditWithThem" | "settled";

export const DEBT_BALANCE_STATE_PHRASE: Record<DebtBalanceState, DebtBalanceLabel>;
export const debtBalanceLabelSchema: z.ZodEnum<...>; // 5 new Arabic phrases
export function getDebtBalanceState(input: {
  currentBalance: number;
  direction?: DebtAccount["direction"] | null;
}): DebtBalanceState;
export function getDebtBalanceAmount(currentBalance: number): number; // abs
export function getDebtBalancePhrase(input): DebtBalanceLabel;
```

The API's `balanceLabel` wire field keeps its name but its enum grows to the
five new phrases; the API computes it through `getDebtBalancePhrase`, so the
web and the wire can never disagree.

Web (`features/debts/debt-utils.ts`):

```ts
getDebtBalanceDisplay(input) -> {
  state, phraseKey: `debts.terminology.states.${state}`,
  amount: number, amountLabel: string,
  textClassName, badgeClassName, description,
}
formatDebtAmount(value) -> positive, grouped
getDebtDirectionLabel(direction) -> مستحقات علينا | مستحقات لنا
```

`getDebtBalanceMeta` stays for the signed movement tone used by the ledger
amount column, the consolidation entries and the void dialog; its
`shortLabel` now carries the new phrase. `getDebtAccountBalanceMeta` was
deleted: every direction-aware balance render site moved to
the display helper, so it had no remaining caller. Old Arabic literals
`لنا عنده` / `علينا له` are removed from the codebase except as negative test
assertions.

## i18n

New keys under `debts.terminology` (Arabic only, the app locale):
`directions.payable|receivable`, `states.owedToUs|owedByUs|creditWithUs|
creditWithThem|settled`, `buttons.recordPayment|recordDebt`.

Renamed display copy: hub create button, ledger/cases buttons, direction keys
(`detailPages.debt.direction.*`), global-search direction labels. Old
`debts.cases.recordPaymentButton` / `createAccountButton` are updated, not
duplicated.

## Render sites switched to the helper

- `debts-hub-page.tsx` — summary cards, filter chips, per-row balance.
- `debt-party-summary-card.tsx` — net party balance.
- `employee-debt-panel.tsx` — employee balance.
- `debt-ledger-panel.tsx` — current-balance card, running-balance column.
- `debt-cases-panel.tsx` — stat card + consolidation preview.
- `externals-page.tsx` — counterparty total.
- `record-payment-dialog.tsx` — current balance.
- `record-entry-payment-dialog.tsx` — opening balance + max payment
  (now receives the account direction).
- `void-entry-dialog.tsx` — opening entry amount (direction-aware).
- `consolidation-dialog.tsx` — account balances + preview.
- `dashboard-overview.tsx` — debt report cards (nonnegative, phrase-labelled).
- `home-view-signed-in-shell.tsx` — global-search debt item.
- `debt-create-page.tsx` — direction labels.

## Tests

- `packages/contracts/src/debt-helpers.test.ts`: state for all four
  direction/sign combinations, zero, net sign-only, absolute amount.
- `apps/web/src/features/debts/debt-utils.test.ts`: display helper for all
  four states + zero; direction labels; `formatDebtAmount` never signed; i18n
  copy pinned to the shared contract phrases.
- `apps/web/src/features/debts/debts-mvp-web.test.tsx`: per-screen phrases +
  positive amounts for the four states and zero, plus a guard that no balance
  renders as a negative number.
- API `company.unit.test.ts` / `company.service.test.ts`: new wire phrases.
- `packages/contracts/src/index.test.ts`: new enum values.
- Update the existing debt web tests that asserted the old labels.

## Risks / migration

- `debtPartySummaryItemSchema.balanceLabel` is a wire enum; both consumers and
  producers ship in the same repo, so widening it is safe. No persisted data
  stores the label (it is computed per request).
- The absolute formatter groups thousands; this is the only intentional
  formatting change and applies to balance displays only.
- No DB migration: only display/wire labels change; balances are untouched.

## Verification

`pnpm --filter @tuari/web test -- --maxWorkers=2`, `pnpm typecheck`,
`pnpm lint`, `pnpm check:unslop`, scoped coverage, plus targeted
`@tuari/contracts` and `@tuari/api` test runs.

## Post-review amendments (fix `6159fbdc`)

An aggressive local review (debate + code-review + test-audit) changed three
decisions above:

- The consolidation dialog's *remaining balance* preview was phrased from the
  sign of a side magnitude; it now derives from the account direction. Its two
  account headers also show the direction-aware state phrase, so an overpaid
  account cannot read as "we owe".
- The gross report totals (`totalOutstandingDzd`, `overdueDzd`,
  `topDebtors.amountDzd`) aggregate BOTH directions (`finance.service.ts`
  documents gross exposure), so the `owedToUs` phrase added to
  `dashboard-overview.tsx` and `report-builder.tsx` was false and was removed.
  `totalSettledDzd` keeps the settled label.
- `formatDebtAmount` keeps up to two centimes so a nonzero sub-dinar balance
  cannot round to a bare `0` beside a direction phrase.
- The void dialog's entry amount also stays signed (`formatDebtMoney`); the
  OPENING case keeps its direction-aware state phrase.

The `debt-create-page.tsx` direction label is correct, but the page never
passes `direction` to `createDebtAccount` (defaults to PAYABLE) — a pre-existing
accounting bug outside this PR's diff, raised to the parent.
