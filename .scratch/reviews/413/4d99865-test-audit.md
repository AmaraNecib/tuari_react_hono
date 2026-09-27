# #413 stock charge — PR #422 review-round test audit

- reviewed code HEAD: `4d998654d9a77c2a06d078ce18f196c3006b91e2`
- base ref: `origin/develop` = `183d2226ec50dab56a45d25fde6f72f319d5a267`
- tier: High-assurance

## What the round added

| Behaviour | Test |
| --- | --- |
| asset created directly on a project is charged (default = purchase price, linked to the purchase movement) | `inventory-transfer-charge.test.ts` createInvoiceGroup block |
| asset created on a warehouse writes no charge | same block |
| invalid non-blank amount blocks submit and shows an error | `transfer-item-dialog.test.tsx` |
| explicit `0` sends a free placement; cleared field sends `null` (server default) | `transfer-item-dialog.test.tsx` |
| blank vs zero vs invalid parsing | `transfer-item-dialog.test.tsx` pure helper |
| `>100%` cut clamps to 0 | `transfer-item-dialog.test.tsx` |
| resolved default above the money bound fails clearly | `asset-charge.service.test.ts` |
| project total rounds `0.1 + 0.2` to `0.3` | `asset-charge.service.test.ts` |
| revision detail (from → to, actor, reason) renders | `asset-charge-history.test.tsx` |
| loading / error / empty history are distinct | `asset-charge-history.test.tsx` |
| rollback after a real insert leaves nothing (charge, revision, movement, location) | `inventory-transfer-charge.test.ts` |
| project delete is refused while a charge exists and the record survives | `schema-definitions.test.ts` + `sqlite-asset-charge.repository.test.ts` |
| invoice-screen asset transfer opens the charge-aware dialog | `inventory-invoice-details-page.test.tsx` |

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm --filter @tuari/api exec vitest run --maxWorkers=2 <4 scoped files>` | 4 files / 73 tests pass |
| full `pnpm --filter @tuari/api test` (with `--maxWorkers=2`) | 1385 pass, 6 fail in 3 documented load-flaky files (`auth/recovery-key.service`, `update/update-history.service`, `auth/adapters/sqlite-bootstrap.port`); each passes standalone (94s / pass / 4.9s) — pre-existing load timeouts, not a regression |
| `pnpm --filter @tuari/web test -- --maxWorkers=2` | 79 files / 661 tests pass |
| scoped coverage, `asset-charge.service.ts` | 100% stmts / 100% branch / 100% funcs |
| scoped coverage, touched web files | `asset-charge-history.tsx` 94.59% stmts / 91.3% branch; dialog/page lower but untested paths are pre-existing |
| `pnpm typecheck` | pass (web had one narrowing error, fixed; re-run `@tuari/web` typecheck pass) |
| `pnpm lint` | pass (`check:i18n-keys`, `check:unslop`, eslint all green) |
| `pnpm check:unslop` | PASS (0 errors) |

## Honesty notes

- The full API suite was run once; its only failures are the three documented
  load-flaky files, which were each re-run standalone and pass. No API test
  touched by this round failed.
- The rollback test now verifies the charge is inserted before the failure and
  that the rollback removes it; the previous test only proved the pre-insert
  validation path.
- The project-FK change is covered at both the DDL level and against a real
  sqlite connection (the delete is actually attempted and refused).
- No Playwright E2E was added in this round; browser-level coverage of the
  transfer dialog remains a documented gap from the prior round.
