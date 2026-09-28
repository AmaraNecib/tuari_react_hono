# #413 stock charge - PR #422 round-2 test audit

- reviewed HEAD: `d93bdfebe6bf12e8b851f7971ce4cd64d448fb84` (code head
  `c10a3d5`; the only later change is a wisdom-only commit, see the delta note)
- base ref: `develop`; round-1 code head `4f49162`
- tier: High-assurance

Round 1 is recorded in `f69630d-test-audit.md`. This file covers the tests added
for the two money-bound findings.

## What the round-2 tests pin

| Behaviour | Test |
| --- | --- |
| an above-bound invoice asset price is refused at the wire gate | contracts: "bounds the invoice asset purchase price with the same money rule as the charge" (`inventoryAssetUnitCreateInputSchema` and `inventoryInvoiceGroupCreateInputSchema`) |
| the stored asset shape shares the same ceiling | same contracts test (`inventoryAssetUnitSchema` accepts `MAX_SAFE_INTEGER`, rejects `MAX_SAFE_INTEGER + 1`) |
| an above-bound invoice asset price is refused at the module seam before any write | `inventory-transfer-charge.test.ts` "refuses an above-bound purchase price before writing anything" (asserts no charge and no movement) |
| a project total above the bound is a typed error, not a broken payload | `asset-charge.service.test.ts` "refuses a project total above the shared money bound instead of emitting it" (asserts `InventoryError`, code `BUSINESS_RULE`, field `totalDzd`, through both `listByProject` and `getProjectCharges`) |
| a total that lands exactly on the bound still works | `asset-charge.service.test.ts` "returns a project total that lands exactly on the shared money bound" |
| the output contract cannot represent an above-bound total | contracts: the extended "project charges schema exposes a non-negative total" test (`MAX_SAFE_INTEGER` accepted, `MAX_SAFE_INTEGER + 1` rejected) |

## Edge cases checked

- Boundary exactly on `MAX_SAFE_INTEGER`: accepted and returned unchanged.
- Sum of two legal charges (`MAX_SAFE_INTEGER` + `1`) exceeds the bound: refused.
- The refusal is the same value the contract rejects, so it cannot reach the
  output schema.
- The invoice refusal happens in phase 1 of `createInvoiceGroup`, before the
  transaction opens, so nothing is persisted.
- Float rounding at the boundary: `roundMoney(MAX_SAFE_INTEGER)` is exactly
  `MAX_SAFE_INTEGER`, verified in the boundary test.
- `0.1 + 0.2` still rounds to `0.3` (round-1 test kept; guard does not change
  the fractional path).

## Gaps and limits

- No new Playwright E2E. The changed behaviour is server-side and covered at the
  contract and service seams; the dialog and page already have component tests
  from round 1.
- `inventory.service.ts` has no full-file coverage gate (the vitest include list
  does not cover the inventory module). The new helper's success and throw
  branches are both exercised by `inventory-transfer-charge.test.ts`.
- The aggregate guard is not exercised with more than two charge rows, because
  two is enough to cross the bound. The incremental loop has one branch and it
  is covered by both the success and throw cases.

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm --filter @tuari/contracts test` | 4 files / 172 tests pass |
| `pnpm --filter @tuari/api exec vitest run --maxWorkers=2 asset-charge.service.test.ts inventory-transfer-charge.test.ts sqlite-asset-charge.repository.test.ts` | 3 files / 36 tests pass |
| `pnpm --filter @tuari/api exec vitest run --maxWorkers=2 inventory.service.test.ts inventory-transfer-workflow.test.ts transaction-lock-guard.test.ts schema-definitions.test.ts` | 4 files / 71 tests pass |
| scoped coverage (`asset-charge.service.ts`) | 100% statements / 100% branches / 100% functions / 100% lines |
| `pnpm --filter @tuari/api test -- --maxWorkers=2` (one full run) | 77 files / 1394 pass, 1 skipped, no failures |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm check:unslop` | PASS (0 errors) |

## Honesty notes

- The full API suite passed clean this run. The documented load-flaky files
  (`auth/recovery-key.service`, `update/update-history.service`,
  `auth/adapters/sqlite-bootstrap.port`) did not fail, so there is no flake to
  report or chase.
- The web suite was not re-run: no web file changed in this round. Web
  typecheck passed.
- `inventory.service.ts` scoped coverage stays low because the file is large and
  most of it is outside this change; the two lines this round added are covered.

## Post-evidence delta

After the review above, `d93bdfe` added `.agents/wisdom/architecture.md` (the
"money bound on a derived default" lesson). No source, test, contract or config
file changed. `git diff --name-only c10a3d5 d93bdfe` is the wisdom file plus the
evidence rename, so the reviewed code is unchanged. The checks in the tables
above still describe the code at `d93bdfe`.
