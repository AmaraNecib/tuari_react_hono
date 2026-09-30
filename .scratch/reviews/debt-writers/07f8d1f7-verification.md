# Debt writers — verification (code HEAD 07f8d1f7)

Lane: `fix-debt-writers`, branch `fix/debt-writers`.
Code commit: `07f8d1f7`, based on `origin/develop` @ `2cfc5fc3`.
Pre-fix runtime numbers: `07f8d1f7-probe-evidence.md`.

This lane is the server/domain side plus **one client line**: the client's
`DEBT_CATEGORIES.SALARY_ADVANCE.impliedDirection` flips to `RECEIVABLE` in the
same commit as the server rejection, because a client still deriving `PAYABLE`
for a salary advance would turn a working action into a validation error. The
rest of the client direction work (always-positive amount plus the sent
direction) stays with the terminology lane.

## Commands and results (after dropping the client change)

| Command | Result |
|---|---|
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm exec vitest run src/modules/company/debt-writers.test.ts src/modules/company/finance.service-coverage.test.ts src/modules/inventory/inventory-debt-sign.test.ts` | 3 files / 64 tests pass |
| `pnpm exec vitest run src/modules/company src/rpc src/tests/integration --coverage --coverage.include="**/finance.service.ts"` | `finance.service.ts` 100% stmts/branch/func/lines (293/293, 238/238, 57/57, 290/290) |
| `pnpm --filter @tuari/contracts test` | 5 files / 211 tests pass |
| `pnpm exec vitest run src/features/debts/debt-create-page.test.tsx` (client direction) | 4 tests pass |
| `pnpm exec vitest run src/features/debts src/features/inventory` (web) | 11 files / 141 tests pass |
| `pnpm exec vitest run --coverage --testTimeout=60000 --hookTimeout=60000` (apps/api, CI gate) | EXIT 0, 84 files / 1558 passed, 2 skipped; coverage 100% (1867 stmts, 1478 branches, 436 funcs, 1779 lines) |
| `pnpm typecheck` | 4/4 tasks pass |
| `pnpm lint` (incl. `check:unslop`) | pass |

After the design-pass fixes (see `design-pass.md`): `pnpm exec vitest run
src/modules/company src/modules/inventory src/rpc src/tests/integration` → 629
pass; `pnpm exec vitest run src/modules/company src/rpc src/tests/integration
--coverage --coverage.include="**/finance.service.ts"` → 100% again; typecheck
and lint still pass.

## Client map flip (atomic with D2)

- `apps/web/src/features/debts/debt-create-page.tsx`
  `DEBT_CATEGORIES.SALARY_ADVANCE.impliedDirection` is `RECEIVABLE`.
- Test: `apps/web/src/features/debts/debt-create-page.test.tsx`
  ("derives the owed-to-us direction for a salary advance (D1a)") asserts the
  page renders the owed-to-us state for the default category, using the i18n
  key so D9 label changes do not break it. Failing-first proved: with the map
  temporarily back at `PAYABLE`, the test fails with "Unable to find an element
  with the text: لنا عنده". A second test pins REIMBURSEMENT at owed-by-us.

## Cases-panel interaction (checked for the terminology branch)

`origin/fix/debt-terminology`'s `DebtCasesPanel` posts
`{ direction: accountDirection, openingBalanceDzd: Math.abs(...) }` with NO
`reasonCategory` (default direction `owed-by-us` = PAYABLE). The category lock
is skipped when no category is supplied, so the server accepts the panel's
explicit direction and no sequencing exception is needed. `DebtCreatePage` on
that branch still derives `SALARY_ADVANCE` as PAYABLE, so its sent direction
only matches the server once this branch's map flip lands; that is the
atomicity the parent sequenced.

## Server-side D2 shape

- `debtReasonCategoryDirectionMap.SALARY_ADVANCE` is `RECEIVABLE` (D1a).
- `getLockedDirectionForCategory` returns the locked direction or `null`.
- `createDebtAccount` derives the direction, rejects a contradicting
  `direction`, and looks the account up by `(party, direction)`.
- `debtAccountCreateInputSchema` rejects the same mismatch at the wire. The
  lock only applies when `reasonCategory` is present; an explicit `direction`
  with no category is accepted, which is the shape `DebtCasesPanel` posts
  (explicit direction, positive amount, no category). Pinned by
  `debt-writers.test.ts` ("accepts an explicit direction with no reason category").
- Failing-first tests: `apps/api/src/modules/company/debt-writers.test.ts`
  ("D2" cases) and `packages/contracts/src/index.test.ts` ("rejects a debt
  account whose direction contradicts its reason category").

## Sequencing note for the parent

The client flip is now in this commit, so once the terminology lane's client
sends the (always-positive) amount with the direction it derives, the sent
direction for `SALARY_ADVANCE` is `RECEIVABLE` and the server accepts it. The
terminology PR (#447) merges first by the parent's decision; this branch is one
commit behind latest `origin/develop` and the parent rebases it at integration.
Do not rebase or push.

## Pre-existing flake (not this lane)

With the default vitest timeouts the full suite intermittently times out on the
`auth` cross-connection lock tests under machine load
(`sqlite-bootstrap.port.test.ts`, `sqlite-recovery-key.port.test.ts`,
`recovery-key.service.test.ts`). This lane touches no `apps/api/src/modules/auth`
code. Stashing all branch changes reproduces the `sqlite-bootstrap.port.test.ts`
5s timeout on the base. With the timeouts raised the suite is green and the
coverage gate is 100%.

## Scope

D2 (server direction derivation + the atomic client map flip), D3 (worker ledger
per direction + composite index), D4 (purchase sign + invariant), D7 (one
payment path / sign by entry type), D8 (outbound first payment). D5
(invoice-module merge) and D9 (UI terminology) are out of this PR by the brief.
