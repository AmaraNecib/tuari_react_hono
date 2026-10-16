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

---

# Issue #458 — design pass, lane 2 (delete the consumerless employee-debt-account read)

- lane: `fix-debt-balance-split`
- base SHA for this pass: `aaeffe42` (lane 1's split commit; the pass reviews only the lane-2
  working-tree diff on top of it)
- scope: the lane-2 diff — contracts, API handler + `FinanceService`, web hook + query key,
  and the tests that referenced them
- lenses: `domain-modeling`, `codebase-design` + `improve-codebase-architecture`
- method: two independent read-only reviewer sub-agents + parent synthesis

## Parent decision: (2) subsumes (1)

The brief allowed (1) to become moot. It did. `employeeDebtAccountGet` and everything behind it are
**deleted**, so the contract-vs-handler envelope mismatch no longer exists to fix; no envelope was
repaired only to be deleted.

A repo-wide grep across `.ts/.tsx/.md/.json/.yaml` (excluding `node_modules`, `dist`, `.scratch`)
found **no real consumer** — no E2E spec, no mobile path, no docs example. The only references were the
definition sites and their tests.

## Deleted (end-to-end)

| Layer | Symbol | File |
| --- | --- | --- |
| contract | `employeeDebtAccountGet` orpc entry | `packages/contracts/src/debts-contract.ts` |
| contract | `employeeDebtAccountGetInputSchema`, `EmployeeDebtAccountGetInput` | `packages/contracts/src/debts.ts` |
| API | `employeeDebtAccountGet` handler | `apps/api/src/rpc/handlers/finance.ts` |
| API | `FinanceService.getEmployeeDebtAccount` | `apps/api/src/modules/company/finance.service.ts` |
| web | `useEmployeeDebtAccountQuery` | `apps/web/src/features/debts/employee-debt-hooks.ts` |
| web | `workspaceQueryKeys.employeeDebtAccount` key | `apps/web/src/features/app-shell/workspace-keys.ts` |
| tests | read-path contract/service/key tests + the query-freshness hook test | `index.test.ts`, `finance.service-coverage.test.ts`, `workspace-keys.test.ts`, `employee-debt-hooks.test.tsx` |

`useCreateEmployeeDebtEntryMutation` stays (the brief named the read path, not the write), but its
cache invalidation could no longer target the deleted key, so it now invalidates
`{ debtsSummary, debtsDetail, employees }` — the same domains every sibling debt mutation invalidates.

## Findings and dispositions

| # | Lens | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | domain | The deleted input schema restated the D3 "one ledger per direction" rule in the API-shape layer. The canonical statements (the `(worker_id, direction)` unique index, `getDebtAccountByWorkerIdAndDirection`) remain where the rule is enforced. | Correct — fewer copies, right layer |
| 2 | domain | D3 stays tested at the layer it lives: repository lookup in `debt-writers.test.ts`, service ledger reuse in `finance.service-coverage.test.ts`. | Correct |
| 3 | domain | No domain rule lost: the deleted read's only rule was the `requireEmployee` existence guard, still enforced on the write path. | Correct |
| 4 | domain | No glossary term introduced or erased. | Correct |
| 5 | domain | No employee-existence validation remains on any debt *read*; only tests called it. | Note — no live caller, no regression |
| 6 | design | `getDebtAccountByWorkerIdAndDirection` is **not** orphaned (still used by the writers); `debtAccountSchema` / `debtAccountDirectionSchema` still used by other contract entries. | Correct |
| 7 | design | New inline `listDebtAccounts().items.find((a) => a.direction === ...)` lookups, introduced when repointing the service tests, duplicated the direction-scoped read across two test files. | **Fixed here** — both files now read `repository.getDebtAccountByWorkerIdAndDirection`, the surviving direction-scoped read (and the pattern already used in `debt-writers.test.ts`) |
| 8 | design | Invalidation target `{ debtsSummary, debtsDetail, employees }` matches the sibling debt mutations; no over/under-invalidation. | Correct |
| 9 | design | No hypothetical seam left: `invalidateUserScopedQuery` is still used by inventory-hooks, and its doc example was updated. | Correct |
| 10 | arch | `useCreateEmployeeDebtEntryMutation` is still consumerless (only its own test references it). It is a real mutation (not a no-op husk) and its server endpoint is live, but the next agent can still mistake it for a mounted path. | **Raised to the parent** — the brief scoped (2) to the read path; deleting the write hook is a separate call |
| 11 | arch | Comments in the hook + test name the deleted `EmployeeDebtPanel` as provenance. | Left — accurate history for this branch; the component's deletion is the reason the read path is gone |
| 12 | arch | The live `debtAccounts` list key is not invalidated by the debt mutations. | Pre-existing; out of scope |

## Red / green

Only one behaviour changed: the create-entry mutation's invalidation target.

- **red**: the new `employee-debt-hooks.test.tsx` case run against the pre-fix production source
  (stash the lane-2 diff, keep the new test) fails — pre-fix invalidates
  `["phase1","workspace-domain","employee-debt-account","user-1","employee-1"]`, not the debts keys.
- **green**: the same case passes on the fix.

The repointed service/key tests are behaviour-preserving (deletion, not new behaviour), so they have
no pre-fix red of their own; the deleted tests' coverage is either removed with the code or preserved at
the repository layer (finding 2).

## Nothing else found

The deletion sweep left no dangling reference in source (grep clean). The diff does not make the debt
code harder to change: it removes a read path nobody called and keeps the surviving direction-scoped
read as the single place a caller names a ledger.
