# Test audit — fix-invoice-create / PR #463 item-offer lane

Reviewed HEAD: `553f9307a91f74cc885bf48751c53bf504e4c7ca`
Base: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`

## Is the equivalence test load-bearing? Yes — proved by mutation

Each mutation was applied alone, the suite run, then reverted. `@tuari/contracts`
was rebuilt before each JS mutation because the API suite resolves the package to
`dist/`.

| mutation | result |
| --- | --- |
| drop SQL `itemTypes` condition | FAIL |
| drop SQL `activeOnly` condition | FAIL |
| drop JS `itemTypes` field | FAIL (only after `@tuari/contracts` build) |
| drop JS `activeOnly` field | FAIL (only after `@tuari/contracts` build) |
| drop SQL search condition | FAIL |
| drop SQL keyset comparison | FAIL (paging never terminates / set mismatch) |

Caveat: the JS half is only load-bearing once contracts are rebuilt. CI's
`test:api` runs `pnpm --filter @tuari/contracts build` first, so it is safe
there; running `vitest` directly in `apps/api` tests the stale `dist`.

## Gaps found and closed in `2ea2728d`

- scope-less / foreign cursor and usage-change cursor reset, and an undecodable
  token reset (the repository recovers instead of throwing).
- non-prefix substring (`%term%`, not `term%`), term trimming, and literal `%`/`_`.
- search-scoped total and paging across matches.
- `updateItemDefinition` both ways (refused with entries, allowed without).
- the web hook `useItemDefinitionOptionsQuery` itself: filter mapping, debounce,
  cursor accumulation, fresh chain on a search change, and `enabled: false`.
- the page does not rewrite the row's kind from a picked item.

## Answers

- Page tests and a kind rewrite: the page test mocks the hook and filters by
  usage, so it can only catch a regression that offers the wrong kind (which it
  does assert); it cannot observe a rewrite that leaves the kind unchanged. The
  added post-pick invariant pins the submitted `kind` too.
- Cursor reset at the boundary: search change (repository and hook), usage
  change, scope-less token and undecodable token are all covered.
- `updateItemDefinition`: refused-with-entries asserts `CONFLICT`; allowed with
  no entries asserts success.

Residual: the equivalence oracle (`matchesItemOfferFilter`) is also the
production gate. The absolute set assertions in the filter-field test are what
stop a rule dropped from both sides at once; both current filter fields are
covered there.
