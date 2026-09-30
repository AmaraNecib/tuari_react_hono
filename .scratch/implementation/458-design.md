# Issue #458 — split `getDebtBalanceState` (no optional direction) and enforce the debt contract

- lane: `fix-debt-balance-split`
- mode: remote
- ticket: GitHub issue #458 (auto-closed in error by PR #464; the work was **not** delivered)
- base ref: `origin/develop` (cached ref, resolves to the same SHA as the branch point)
- base SHA: `e526acecbe9df23239c9083d99d5e7e49b854f4f`
- local `develop` is stale (`fdb5dda6`) — recorded, not used as the base
- review tier: **High-assurance** (financial sign/derivation rules)
- date: 2026-09-30

## Problem

`getDebtBalanceState({ currentBalance, direction? })` overloads two questions:

1. a figure that **has** a direction (an account balance, a per-account entry), where a
   positive balance means different things for `PAYABLE` and `RECEIVABLE`; and
2. a **net** figure with no direction, where the sign alone carries the meaning.

When `direction` is absent the function silently falls back to (2). That is the exact
shape of the original bug (a payable remainder phrased as "owed to us") and it lets a
caller render a direction phrase on a figure that has no direction.

The contract also under-enforces two rules the UI now assumes: a debt account's opening
balance must be positive (the direction carries the sign), and a direction must be
required on `createDebtAccount` rather than defaulting to `PAYABLE` in the service.

`getEmployeeDebtAccount(employeeId)` returns `accounts[0]` — direction-blind for a worker
who now holds up to two ledgers (D3).

## Public API change

### `packages/contracts/src/debt-helpers.ts`

Delete the overloads. Replace with two pairs, no optional direction anywhere:

| old | new |
| --- | --- |
| `getDebtBalanceState({ currentBalance, direction? })` | `getDebtAccountBalanceState(account)` and `getNetDebtBalanceState(netBalance)` |
| `getDebtBalancePhrase({ currentBalance, direction? })` | `getDebtAccountBalancePhrase(account)` and `getNetDebtBalancePhrase(netBalance)` |

- `DebtBalanceAccount = Pick<DebtAccount, "currentBalance" | "direction">` already exists and
  is the account-aware parameter type.
- `getDebtAccountBalanceState` throws `DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE` when the
  direction is not `PAYABLE`/`RECEIVABLE`. The throw is the runtime enforcement of
  "cannot be called without a direction" (the type stops it in TS; the throw is the red
  proof and the defense against a cast/dirty row). It never falls back to the sign.
- `getNetDebtBalanceState(netBalance)` is the sign-only path: positive = owed to us.
- `DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE` lives in `debt-helpers.ts` (not `debts.ts`) so
  the service can share it without a `debts.ts → debt-helpers.ts → debts.ts` cycle.

### `packages/contracts/src/debts.ts`

- `debtAccountCreateInputSchema.direction`: required (`debtAccountDirectionSchema`, drop
  `.optional()`). Inferred `DebtAccountCreateInput` now requires it, so every typed caller
  must choose.
- `debtAccountCreateInputSchema.openingBalanceDzd`: `z.number().finite().positive().optional()`.
  Absent means "no opening" (0). A supplied 0 or negative is rejected.
- keep the D2 mismatch rejection; the category is a **consistency constraint**, not a
  direction source.
- `employeeDebtAccountGetInputSchema`: add required `direction`.

### `apps/api/src/modules/company/finance.service.ts`

- `getEmployeeDebtAccount(employeeId, direction)` uses
  `repository.getDebtAccountByWorkerIdAndDirection` — a caller must say which ledger.
- `createDebtAccount`: `const direction = lockedDirection ?? input.direction;` then throw
  `DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE` when absent. The `?? "PAYABLE"` default is gone.
- opening balance: reject a non-finite or negative value server-side as well as at the wire.

### `apps/web/src/features/debts/debt-utils.ts`

- Replace `getDebtBalanceDisplay(input)` with `getDebtAccountBalanceDisplay(account)` and
  `getNetDebtBalanceDisplay(netBalance)`, mirroring the contract split.
- Drop `phraseKey`; render the contract phrase (`display.phrase`) so the i18n
  `debts.terminology.states` table is no longer a second copy (see "Also in this batch").
- Extract the hub filter predicate as `matchesDebtHubFilter(row, filter)` so it is testable
  through its interface, not only through the rendered table.

### `apps/web/src/features/debts/employee-debt-hooks.ts`

- `useEmployeeDebtAccountQuery(employeeId, direction)`; the direction is part of the query
  key and the RPC input.

### `apps/web/src/features/debts/employee-debt-panel.tsx`

- The panel has no production consumer (`DebtCasesPanel` is the live worker-debt view).
  Delete it and its `date-picker-screens.test.tsx` block; keep the updated hook.

## Interaction with the debt-writers derivation (#464)

#464 derives the direction in `createEmployeeDebtEntry` (`resolveEmployeeEntryDirection`)
and rejects a category/direction mismatch in both the wire schema and the service. This PR
does **not** add a second derivation: it keeps that resolver as the single derivation for
employee entries, and makes `createDebtAccount` demand an explicit direction (the category
only validates a mismatch). Sequencing, not duplication.

## Tests (red/green)

| behaviour | test | red on pre-fix code? |
| --- | --- | --- |
| a negative opening balance is rejected | contract + service | yes — pre-fix `.finite()` accepts -1 |
| a missing direction is rejected | contract + service | yes — pre-fix defaults to PAYABLE |
| account-aware state/phrase | contracts unit | new function; exercises all four directions + zero |
| net state/phrase | contracts unit | new function; positive/negative/zero |
| the direction-aware function refuses a direction-less figure | contracts unit (cast) | yes — pre-fix returns `owedToUs` by sign |
| `getEmployeeDebtAccount` requires a direction | api service | yes — pre-fix returns `accounts[0]` |
| each web display split function | web unit | new functions |
| hub filter predicate | web unit | new function (previously only rendered) |

Each behaviour test is first run against the pre-fix checkout (stash the source change) to
record the red proof, then against the fix for green. `VITEST_MAX_WORKERS=2` for every run.

## Risks / migration

- `direction` required is a wire contract change; the only web callers
  (`debt-create-page`, `debt-cases-panel`) already send it. The ~80 server-side test
  call sites must state it.
- `openingBalanceDzd` positive: the `DebtCasesPanel` currently sends `Math.abs(value)`,
  which can be 0; it will omit the field when 0.
- `getEmployeeDebtAccount` loses the `accounts[0]` behavior; the only consumers were tests
  and the dead panel.

## Red proofs (verified)

Each behaviour test was run against the pre-fix source (production file stashed back to the
base, test kept) before the green run:

| test | pre-fix result |
| --- | --- |
| `requires a direction on createDebtAccount` | failed — base schema accepted the missing direction |
| `rejects a negative opening balance` | failed — base schema accepted `-500` |
| `requires a direction on the single employee debt account read` | failed — base input had no direction |
| `refuses a direction-less figure instead of falling back to the sign` | base `getDebtBalanceState({ currentBalance: 600 })` returned `owedToUs` (scratch proof) |
| `reads the ledger the caller names when the worker holds two` | failed — base `getEmployeeDebtAccount` returned `accounts[0]` for both directions |
| `rejects createDebtAccount with no direction instead of defaulting to PAYABLE` | failed — base defaulted to PAYABLE |
| `rejects a negative opening balance server-side too` | failed — base accepted it |

The web display/filter tests reference functions that do not exist pre-fix, so their red is
an import/module failure on the base; the underlying behaviour is the same sign-fallback
proven above.

## Out of scope (filed / deferred)

- The endpoint envelope for `employeeDebtAccountGet` (`createEntityResultSchema` vs the raw
  account the service returns) is a pre-existing inconsistency; no production consumer
  remains after the panel is deleted. Recorded in the design pass.
- The pnpm/npm-based `debts.terminology.buttons` duplicates are left, as the issue names
  states and directions.
