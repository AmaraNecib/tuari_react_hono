# fix-invoice-create — local verification evidence

- **Owner items**: 11 (invoice creation fails silently), 10 (invoice attachments),
  13 (row type control, variant C), 12 (add action at the bottom), plus the
  item-offer seam re-expression.
- **Branch**: `fix/invoice-create`
- **Base**: `develop` @ `5d0629be768a75689c081249843af4a79d045230` (rebased onto
  #442/#445/#446; the latest develop commit `93b0cba3` is the design-pass docs only)
- **Final reviewable HEAD**: `b857eb28258ba527b9b1d6c2c9e5ba83294fc99e`
- **Mode**: local verification only (no push, no PR, no hosted review)
- **Tier**: Standard

## Commands and results (final HEAD unless noted)

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm --filter @tuari/contracts test` | pass — 217 tests (incl. `inventory-item-usage.test.ts`) |
| `pnpm typecheck` | pass (4/4 turbo tasks) |
| `pnpm lint` | pass (incl. i18n-keys, web-hygiene, repo-hygiene, check:unslop, eslint api+web) |
| `pnpm test:web` (91 files) | pass — 811 tests |
| `pnpm test:api` (86 files) | **load-timeout flakes only** — 16 tests in `recovery-key.*`, `update-history.*`, `sqlite-bootstrap.port`, `fifo-lock` timed out at 10–13s under concurrent full-suite load; all pass standalone (67/67) and are the known loaded-machine class. The item-offer/invoice/cursor suites are green. |
| `pnpm --filter @tuari/api exec vitest run src/modules/inventory src/modules/shared/cursor.test.ts src/rpc/router.test.ts --maxWorkers=2` | pass — 153 tests |
| `pnpm --filter @tuari/web exec vitest run src/components/ui/form-controls.test.tsx src/features/inventory/inventory-invoice-create-page.test.tsx src/features/inventory/invoice-attachment-rules.test.ts --maxWorkers=2` | pass — 42 tests |
| `npx playwright test tests/e2e/inventory-invoice-create.spec.ts --workers=1` | pass — 3/3 |
| `item-offer-equivalence.test.ts` | pass — 6 tests |

## Failing-first proofs

1. **Items 13 + 12 (red→green).** The 5 new page tests were run against the
   pre-change implementation (all lane implementation files stashed):
   `5 failed | 30 skipped` — exactly the one-add-action, row-type-control,
   no-type-blocks-save, options-filtered-by-type, and add-action-DOM-order
   tests. After the change: 35/35 in that file.
2. **The equivalence test is load-bearing.** Removing the `itemTypes` condition
   from the repository's SQL compiler (leaving `activeOnly`) made
   `item-offer-equivalence.test.ts` fail 3/6 — the SQL path and JS path
   disagree once a filter field is not taught to SQL. Restored immediately and
   re-verified 6/6.

## What the change pins

- **Item-offer rule in one place**: `resolveItemOffer` (data) is consumed by the
  SQL compiler (paged picker) and `matchesItemOfferFilter` (write gate); the
  equivalence test enumerates every fixture × usage and requires the two
  evaluators to agree, with a witness definition for each filter field.
- **Paged picker**: new `inventoryItemDefinitionOptions` (cursor + usage +
  search → paginated result); `inventoryItemDefinitionsList` unchanged. Keyset
  on `(name COLLATE NOCASE, id)`, limit+1 probe, total count, scoped cursor with
  restart-on-mismatch.
- **Retroactive bypass closed**: `updateItemDefinition` refuses an `itemType`
  change while entries reference the definition (CONFLICT).
- **Web**: one deep hook owns usage→filter, debounce, cursor chain, accumulation;
  the picker is a thin adapter; the row holds the picked option; changing kind
  clears the item and never rewrites the kind.
- **Earlier in the lane (already committed)**: API failure logging with the
  400/500 status and `encodeFailed` marker; the disabled-save reason reusing
  `validateLines`; attachment validation naming the file.

## Design pass

`.scratch/reviews/invoice-create/design-pass.md` — one in-scope fix (removed an
unused `resolve` seam from the web hook), two kept-with-rationale items, and
three recommended follow-ups.

## Not run (parent)

- Greptile / hosted review — account out of quota; the parent runs the local
  review skills on the pushed head.
- `pnpm test:e2e` full suite — only the touched spec.
- Push / PR / merge — parent-owned.

## Post-rebase delta

Rebased onto `5d0629be` (#442/#445/#446) resolving conflicts in
`form-controls.test.tsx` (kept BOTH the develop placeholder-contrast tests and
the lane's FileInput tests) and `.agents/wisdom/architecture.md` (kept both
lessons). Re-ran at the rebased HEAD: contracts build, `pnpm typecheck`,
`pnpm lint`, the touched web suites (55), the touched API suites (153), and the
invoice E2E (3/3) — all green. The full `pnpm test:web` (91 files / 811 tests)
and the full `pnpm test:api` (modulo the loaded-machine timeouts) were green
before the rebase; no web/API logic changed in the rebase beyond the two file
merges above.
