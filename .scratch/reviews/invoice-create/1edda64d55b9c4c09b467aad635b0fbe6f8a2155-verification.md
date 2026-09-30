# fix-invoice-create — local verification evidence

- **Issue**: owner items 11 (invoice creation fails silently) + 10 (invoice attachments)
- **Branch**: `fix/invoice-create`
- **Base**: `develop` @ `22495413b7d792e20afcce24a94d6c84c61dd523`
- **HEAD verified**: `799249ed46cccbbc80abb129787515d8d850f1e3`
- **Mode**: local verification only (no push, no PR, no hosted review per the lane brief)
- **Tier**: Standard

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm typecheck` | pass (4/4 tasks) |
| `pnpm lint` | pass (incl. `check:i18n-keys`, `check:web-hygiene`, `check:repo-hygiene`, `check:unslop`, eslint api+web) |
| `pnpm test:api` (83 files) | pass — 1528 passed, 2 skipped |
| `pnpm test:web` (85 files) | 735 passed, **1 pre-existing failure** (see waiver) |
| `pnpm --filter @tuari/api exec vitest run src/app/create-app.test.ts src/infrastructure/observability/request-failure.test.ts src/infrastructure/observability/logger.test.ts --maxWorkers=2` | pass — 57 tests |
| `pnpm --filter @tuari/web exec vitest run src/components/ui/form-controls.test.tsx src/features/inventory/inventory-invoice-create-page.test.tsx src/features/inventory/invoice-attachment-rules.test.ts --maxWorkers=2` | pass — 37 tests |
| `npx playwright test tests/e2e/inventory-invoice-create.spec.ts --workers=1` | pass — 3/3 (incl. the new disabled-reason + attachment-by-name test) |
| scoped coverage, `request-failure.ts` | 100% stmts / 100% lines / 100% funcs / 95.45% branch |
| scoped coverage, touched web files (with existing files in scope) | `invoice-attachment-rules.ts` 100% (dropped from the text table); `form-controls.tsx` 80% stmts / 68.75% branch (the pre-existing Currency/Textarea/FieldSection components are not exercised by the FileInput test); `inventory-invoice-create-page.tsx` 69.44% stmts (large pre-existing page) |

## What the change pins

- **API**: a rejected mutation logs **exactly one** line containing the domain error message and the procedure
  (`create-app.test.ts`); a successful mutation logs **nothing**; a thrown procedure error logs
  **once** with the real message; a transport 4xx logs once from its response body; unhandled throws
  are logged and rethrown.
- **Web**: `validateLines` drives both the submit gate and the disabled-Save reason (no lines, or the
  exact incomplete line/item); `FileInput` shows the chosen name/count and forwards `onChange`;
  unsupported/oversized attachments are rejected by name before any invoice is created; a server
  upload rejection surfaces its own file-naming message; the create-first/upload-after/retry-only
  shape is unchanged (`inventory-invoice-create-page.test.tsx`, `form-controls.test.tsx`,
  `invoice-attachment-rules.test.ts`).
- **E2E**: the disabled Save reason and the `.txt` attachment rejection are asserted in the browser.

## Waiver — pre-existing red test

`apps/web/src/features/date-picker-screens.test.tsx > TransferItemDialog submits the picked day for a
transfer (#428) > passes the canonical picked day as occurredAt` fails with
`No QueryClient set, use QueryClientProvider to set one` (the transfer dialog mounts
`useAssetChargeDefaultQuery` without a QueryClient in the test harness). Reproduced with every lane
change stashed (`git stash` → run → same failure), so it is the pinned base's failure, not this
branch's. Out of scope; the parent decides whether to fix it separately.

## Not run (deferred to the parent)

- Greptile CLI / hosted review — the lane brief says reviews are local now and no hosted review is
  requested. No Greptile result is claimed.
- `pnpm test:e2e` full suite — only the touched spec was run (the brief scoped E2E to
  `inventory-invoice-create.spec.ts`).
- Push / PR / merge — parent-owned.

## Post-evidence delta

- `1edda64d` adds `.agents/wisdom/architecture.md` only (the ORPC
  error-observability lesson). No source, test, or config file changed after the
  verified implementation commit `799249ed`, so every command result above still
  applies.
