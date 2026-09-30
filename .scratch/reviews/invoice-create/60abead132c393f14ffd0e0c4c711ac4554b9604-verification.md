# fix-invoice-create — local verification evidence

- **Issue**: owner items 11 (invoice creation fails silently) + 10 (invoice attachments)
- **Branch**: `fix/invoice-create`
- **Base**: `develop` @ `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36` (rebased; started from
  `22495413`, then develop advanced with #441)
- **Reviewable HEAD**: `60abead132c393f14ffd0e0c4c711ac4554b9604` (encode-failure marker)
- **Code commits**: `9833e3a108b87e03753115184f7e3c2aa815911b` (feature) →
  `b2da6560b979cfe74944143d549bb2e4d285f21f` (400/500 status) → `60abead1` (encodeFailed marker)
- **Mode**: local verification only (no push, no PR, no hosted review per the lane brief)
- **Tier**: Standard

## Commands and results (final, at `60abead1` unless noted)

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm typecheck` | pass (4/4 tasks) |
| `pnpm lint` | pass (incl. `check:i18n-keys`, `check:web-hygiene`, `check:repo-hygiene`, `check:unslop`, eslint api+web) |
| `pnpm test:api` (83 files) | pass — 1539 passed, 2 skipped |
| `pnpm test:web` (85 files, at `9833e3a1`; no web file changed since) | pass — 736 passed |
| `pnpm --filter @tuari/api exec vitest run src/app/create-app.test.ts src/infrastructure/observability/request-failure.test.ts src/infrastructure/observability/logger.test.ts --maxWorkers=2` | pass — 68 tests |
| `pnpm --filter @tuari/web exec vitest run src/components/ui/form-controls.test.tsx src/features/inventory/inventory-invoice-create-page.test.tsx src/features/inventory/invoice-attachment-rules.test.ts --maxWorkers=2` | pass — 37 tests |
| `npx playwright test tests/e2e/inventory-invoice-create.spec.ts --workers=1` | pass — 3/3 (re-run after the marker change) |
| scoped coverage, `request-failure.ts` | 100% stmts / branch / funcs / lines |
| scoped coverage, touched web files (with existing files in scope) | `invoice-attachment-rules.ts` 100%; `form-controls.tsx` 80% stmts / 68.75% branch (the other pre-existing controls are not exercised by the FileInput test); `inventory-invoice-create-page.tsx` 69.44% stmts (large pre-existing page) |

One full `pnpm test:api` run under concurrent E2E/coverage load timed out in
`recovery-key.service.test.ts` and `update-history.service.test.ts` (10–12s); both pass
standalone and the clean re-run above is 1539/2 skipped. Known loaded-machine class.

## What the change pins

- **API logging**: a rejected mutation logs **exactly one** line containing the domain error
  message and the procedure; a success logs **nothing**; a thrown procedure error logs once with
  the real message; a transport 4xx logs once; unhandled throws are logged and rethrown.
- **Status truthfulness**: a malformed RPC request body is logged at **400** (ORPC's mapped
  status) and a server-side output/encode failure at **500**, never the reverse.
- **Encode-failure marker**: the server failing to encode its own response is flagged
  `"encodeFailed":true`; the marker is present on the encode 500 and absent on the malformed 400.
  Covered by a classification test (`recordInterceptedFailure`), an emission test
  (`logRpcResponseFailure`), a chained end-to-end helper test, and the `createApp` malformed-body
  integration test asserting absence.
- **Web**: `validateLines` drives both the submit gate and the disabled-Save reason (no lines, or
  the exact incomplete line/item); `FileInput` shows the chosen name/count and forwards
  `onChange`; unsupported/oversized attachments are rejected by name before any invoice is
  created; a server upload rejection surfaces its own file-naming message; the
  create-first/upload-after/retry-only shape is unchanged.
- **E2E**: the disabled Save reason and the `.txt` attachment rejection are asserted in the
  browser.

## Not run (deferred to the parent)

- Greptile CLI / hosted review — the account is out of quota; the parent runs the local review
  (debate + code-review + test-audit) on the pushed head. No Greptile result is claimed.
- `pnpm test:e2e` full suite — only the touched spec was run (the brief scoped E2E to
  `inventory-invoice-create.spec.ts`).
- Push / PR / merge — parent-owned.
