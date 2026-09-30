# Issue #458 — design pass (mandatory on the finished diff)

- lane: `fix-debt-balance-split`
- base SHA: `e526acecbe9df23239c9083d99d5e7e49b854f4f` (`origin/develop`)
- scope: the whole uncommitted diff vs the base (contracts, API service/handler, web debt UI + i18n)
- lenses: `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- method: three independent read-only reviewer sub-agents + parent synthesis

## Findings and dispositions

| # | Lens | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | domain | The account/net split is named consistently in contracts and web. | Correct, no action |
| 2 | domain | `getDebtBalanceLabel(balance)` was the **net** reader but kept the unqualified "balance" name — the exact word the split disambiguates. | **Fixed here** — renamed `getNetDebtBalanceLabel` (helpers + 3 call sites + test) |
| 3 | domain | `DEBT_ACCOUNT_DIRECTION_REQUIRED_MESSAGE` lives in `debt-helpers.ts` and the service imports the same constant, so the rule is stated once. | Correct, no action |
| 4 | domain | `getDebtAccountNetContribution` still treated a missing direction as implicit PAYABLE — the same fallback the split removed elsewhere. | **Fixed here** — shared `requireLedgerDirection` guard + a test |
| 5 | domain | Required-direction does not conflict with the D2/#464 category lock; the mismatch check is untouched and the old `?? "PAYABLE"` is gone. | Correct, no action |
| 6 | domain | No debt glossary exists; the account-vs-net rule and the "category = consistency for accounts, derivation for entries" asymmetry live only in code. | **Filed as follow-up** — ongoing recommendation from the debt-terminology pass (`docs/domain/debt/CONTEXT.md`); not a code change |
| 7 | domain | Removing the i18n `debts.terminology.states`/`directions` left a single source (the contract phrase table) and no dangling `t()` key. | Correct, no action |
| 8 | domain | Direction words stay hardcoded in web `getDebtDirectionLabel` (their i18n copy was dead already). | Left justified — pre-existing asymmetry, removal was safe |
| 9 | domain | The hub filter list mixes i18n `all` with contract state labels. | Justified — `all` is chrome, not a debt state |
| 10 | design | Web `DebtBalanceLookup` re-declared the contract's exported `DebtBalanceAccount` identically. | **Fixed here** — import the contract type |
| 11 | design | `getDebtAccountBalance` became dead after the ledger panel stopped calling it (test-only, `as never`). | **Fixed here** — deleted with its test block |
| 12 | design | The `getDebtAccountBalanceState` throw is type-unreachable (direction is a non-nullable enum); it is the red-proof/no-silent-fallback guard, not a live validation path, and can surface as a render-time error on a dirty row. | Left justified — the sign law must never silently fall back; a boundary row-parse guard is a broader change |
| 13 | design | The direction invariant is now encoded in three layers (zod enum + two throws). | Note — defense-in-depth, cheap |
| 14 | design | Schema opening-balance `.positive()` vs service `< 0` differ at 0. | Note — intentional: wire rejects an explicit 0, the service's `?? 0` means "no opening" |
| 15 | design | `employeeDebtAccountGet`'s contract output (`createEntityResultSchema`) does not match the handler's raw-account return; the hook expects the envelope. | **Left** — pre-existing; dormant once the panel is deleted; raised to the parent as a decision |
| 16 | design | After the panel deletion, `useEmployeeDebtAccountQuery` has no production consumer. | **Left** — the issue explicitly says "update its hook"; deleting the hook/endpoint is a scope call; raised to the parent |
| 17 | arch | `matchesDebtHubFilter` extraction is semantics-preserving and now testable through its interface. | Correct, no action |
| 18 | arch | `buildDebtBalanceDisplay` is a real private seam (dedups tone/amount across the two public adapters). | Correct, no action |
| 19 | arch | Moving user-facing copy from i18n into the contract narrows the translation seam (one locale). | Left justified — the issue offered "delete the i18n copies and read from the contract" |
| 20 | arch | `debts.terminology.buttons` still duplicates `debts.cases.recordPaymentButton`/`createAccountButton`. | Out of the issue's stated scope (states + directions); left |
| 21 | arch | The two dialogs take decomposed `accountCurrentBalance` + `accountDirection` rather than the account object. | Left — required props already fix the silent degradation; passing the object is a style follow-up |
| 22 | arch | `DebtHubFilter` row param is inline, not a shared row type. | Speculative; left |
| 23 | arch | `company.helpers.ts` label readers are thin pass-throughs. | Pre-existing; touched, not deepened |

## Fixes applied in this pass

- Renamed `getDebtBalanceLabel` → `getNetDebtBalanceLabel` (API + callers + test).
- Added the shared `requireLedgerDirection` guard to `getDebtAccountNetContribution` and a test.
- Web imports the contract `DebtBalanceAccount` type instead of a local duplicate.
- Deleted the dead `getDebtAccountBalance` helper and its test.
- Documented that the credit states are unreachable for a net figure.

## Found by the full suite after the pass (also fixed here)

- The web `useCreateDebtAccountMutation` still carried `direction ?? "PAYABLE"` and coerced
  an absent opening to `0`. The new wire rules make both wrong: the direction fallback is
  exactly the silent default this issue removes, and a supplied `0` is now rejected. The
  mutation now requires `direction` and passes an absent `openingBalanceDzd` through as
  `undefined`; pinned by a new `workspace-mutations.test.ts` case.
- Loose test harnesses (`reports.test.ts`, `router.test.ts`) called the create RPC without a
  direction; updated to pass it (and the router's negative-opening adjustment to a positive
  one). These were invisible to `tsc` because those harnesses are loosely typed.

## Raised to the parent (no silent deferral)

1. `employeeDebtAccountGet`'s envelope mismatch (contract `createEntityResultSchema` vs the
   raw account the handler returns). Dormant with no production consumer. Fix in this PR,
   file an issue, or leave?
2. `useEmployeeDebtAccountQuery` (and arguably the whole `employee-debt-hooks` module) is
   consumerless after the panel deletion. The issue said "update its hook", so it was kept
   and made direction-explicit; delete it in this PR or keep as a typed, reserved read?

## Nothing else found

No residual `getDebtBalanceState`/`getDebtBalancePhrase`/`getDebtBalanceDisplay`/`phraseKey`
references remain, and all tightened call sites (non-null `DebtLedgerPanel` account,
required dialog `accountDirection`, required `direction` on create/read) are supplied by
every caller. The diff does not leave the debt code harder to change; it removes the
overload that was the shape of the original bug.
