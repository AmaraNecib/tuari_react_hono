# Code review — outbound item picker availability (#465)

Reviewed commit `918290aa` (base `551948e4`). Two fresh-context axes
(Standards, Spec), synthesised. Findings table below; fixes landed in
`918290aa`.

## Standards

| # | Sev | Finding | Verdict |
| --- | --- | --- | --- |
| S1 | — | One rule, stated once in `resolveItemOffer`; both evaluators consume the same `InventoryItemOfferFilter`; no predicate copy-pasted. | Correct. |
| S2 | — | Every `surface` consumer is exhaustive: `resolveItemOffer` and `itemUsageKey` both end in a `never` check. No third switch without one. | Correct. |
| S3 | — | i18n: the one new key `inventory.transfer.chooseSourceFirst` is present (`ar.ts:923`) and used via `t()`; `pnpm lint` (which runs `check:i18n-keys`) is green. | Correct. |
| S4 | — | No colour literals or design-token violations in the changed JSX. | Correct. |
| S5 | Low | The changed page keeps pre-existing hard-coded Arabic validation strings; the diff removed one but left the rest. | Dismissed as out of scope (predates `dfdaad48`, unchanged by the fix). |
| S6 | Low | The page test's hook mock restates the availability rule. | Accepted; the SQL/JS equivalence suite is the anti-drift guard. |

## Spec — "the picker offers what is in stock at the chosen source, and nothing archived"

| Criterion | Verdict | Proof |
| --- | --- | --- |
| Usage derived from the chosen source; no options until a source is chosen | Met | `outbound-transfer-create-page.tsx:41-48,190`; page test. |
| Paged read filters by stock and active | Met | `sqlite-inventory.repository.ts:272-303`; equivalence traps (`c-active`/`a-active` offered at `wh-1`, `p-active` at `prj-1`, `wh-2` empty, `c-archived` excluded despite stock). |
| Cursor scope includes the source | Met | `sqlite-inventory.repository.ts:310-314` + reset test. |
| Archived item cannot be offered | Met | `activeOnly` + fixture with stock; JS and SQL both exclude. |
| Unavailable/archived item cannot be selected and submitted | **Was not met, now met** | A stale pick survived a source change; fixed by clearing the pick on source change, with a test that fails on `dfdaad48`. |
| Source switch does not leave the old source's item offered | **Was not met, now met** | Same fix/test. |

The design doc's claim that "the server write gate rejects an unavailable row"
was **false** for the outbound path (the write gate is #450 and does not consult
the rule). The doc was corrected; the gate itself is untouched per the brief.

## Fixes

- `outbound-transfer-create-page.tsx` — clear picked items on a source change;
  functional state updates.
- `item-list-editor.tsx` — stable row ids as keys.
- `inventory-hooks.test.tsx`, `outbound-transfer-create-page.test.tsx` — tests
  for the cache key, the source change, and the submit payload.
- `inventory-item-usage.ts` — doc comment no longer overclaims write-gate
  enforcement for `OUTBOUND_PICK`.
