# Debt terminology — parent fixes + design pass resolution

- lane: fix-debt-terminology
- base SHA: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
- code fix SHA: `e622080bb6bfea812d9e9cdd34b36abfda99e25d`
- evidence HEAD: `265ddbda7c60485204126e73cc9088955a317f0d` (docs only)
- earlier code SHAs: `6159fbdc` (consolidation/void/gross), `d6f677d4` (void delta)

## Parent ask 1 — the E2E spec

`tests/e2e/debt-entry.spec.ts`:

- Line 62 comment: now documents the direction phrase + positive amount, not the
  old signed convention.
- Line 68 (hub, opening 5000): asserts `مستحق علينا`, `/5,000/`, and
  `not.toContainText(/-5\s?000/)`.
- Line 100 (ledger after a 2000 payment): was `getByText(/\+3000/)`, now asserts
  `مستحق علينا` and `/3,000/` and `getByText(/-3,000/)).toHaveCount(0)`.
- Line 107 (hub after payment): asserts `مستحق علينا`, `/3,000/`, and
  `not.toContainText(/-3\s?000/)`.

Grepped the rest of `tests/e2e/`: no other signed-balance assertions remained
(the other `-[0-9]` matches are employee-name suffixes and inventory codes).

## Parent ask 2 — the create-page direction fix

`debt-create-page.tsx` now sends `direction: accountDirection` and
`openingBalanceDzd: amountValue` (always positive). `debtDirectionFromAlias`
(`debt-utils.ts`) is the one alias → domain mapping, used for both the wire
direction and the direction label.

**What the server does with it today** (`finance.service.ts` `createDebtAccount`):
`direction: input.direction ?? "PAYABLE"` — it stores the direction we send,
sets `currentBalance = openingBalance`, and `status = getDebtAccountStatus(openingBalance)`.
It does **not** derive direction from `reasonCategory`, the sign, or override it.
So the client now sends the truth; server-side derivation is the debt-writers
lane's separate PR and was not touched here.

Tests: both toggles assert the direction sent, the positive amount, and the
resulting phrase (`مستحق لنا` / `مستحق علينا`) via the same helper the ledger
uses. Both failed on pre-fix source (direction was `undefined`).

## Design pass

See `design-pass.md`. In-scope fixes: deleted the shallow `getDebtBalanceMeta`
(movement tone is now direction-aware), extracted `getConsolidationRemainder`,
removed the dead `amountLabel`, added `debtDirectionFromAlias`. Follow-ups are
listed there.

## Commands (final code HEAD `e622080b`)

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm typecheck` | 0 | 4/4 tasks |
| `pnpm lint` | 0 | turbo 2/2 + `check:i18n-keys`; `check:unslop` PASS |
| contracts `debt-helpers.test.ts --coverage` | 0 | 25 passed, 100% stmts/branch/funcs/lines |
| web `debt-utils` + `debts-mvp-web` + `date-picker-screens` + `report-builder` (`--maxWorkers=2`) | 0 | 50 passed |
| `tests/e2e/debt-entry.spec.ts` (API_PORT=4318 WEB_PORT=3000, `--workers=1`) | 0 | 2 passed |

## Could not verify

- No hosted Greptile review (parent's instruction: local review is the gate).
- The other e2e specs were not run; only `debt-entry.spec.ts` exercises the debt
  balances changed here.
