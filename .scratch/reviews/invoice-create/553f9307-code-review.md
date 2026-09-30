# Code review — fix-invoice-create / PR #463 item-offer lane

Reviewed HEAD: `553f9307a91f74cc885bf48751c53bf504e4c7ca`
Base: `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`

## Standards

| check | verdict |
| --- | --- |
| One rule, two evaluators, no drift | PASS. `resolveItemOffer` is the one statement; the SQL compiler and `matchesItemOfferFilter` are the evaluators; the write gate calls the JS evaluator instead of restating the rule. |
| Contracts used consistently | PASS. The wire carries `usage`; an unknown surface fails the `never` exhaustiveness check. The two literal kind comparisons in the invoice path are gone. |
| i18n | PASS. The new `inventory.invoiceCreate.*` keys exist in `ar.ts` and are used via `t()`. Pre-existing hardcoded strings remain but predate this diff. |
| No colour literals | PASS. Error states use the `text-destructive` token. |
| Duplication | FIXED. `escapeLikePattern` moved to `modules/shared/sql-search.ts` and both repositories import it. |
| Speculative surface | FIXED. The unused `itemType` parameter on `useInventoryItemDefinitionsQuery` (the picker moved to the paged seam) was removed. |

## Spec (owner items 10–13)

| item | requirement | verdict |
| --- | --- | --- |
| 10 | API logs failures readably | PASS. `request-failure.ts` emits one readable `Request failed` line with method/path/status/message; already exercised by `create-app.test.ts`. |
| 11 | A blocked save must say why | PASS. `saveDisabledReason` names the missing kind/item and renders next to the disabled Save; the debt-bound errors render on click. |
| 12 | Attachments name the rejected file | PASS. Client validation and the server upload rejection both carry the file name; tested and E2E-asserted. |
| 13 | Kind is a control inside the row and filters the picker | PASS. Type select is the row's first control, gates the picker, and options are server-filtered by the resolved usage; the two old add buttons are one add action. |

## Design pass verification

`.scratch/reviews/invoice-create/design-pass.md`:

- The speculative `resolve(id)` hook seam is gone; no caller needs it (the row
  holds the picked option). Confirmed.
- Three follow-ups describe real problems: no inventory glossary exists
  (`CONTEXT.md` is diagnostics-scoped), the expense stock selector still reads
  the unpaged list, and the catalog page still windows client-side (#442).
- Correction: the expense selector does **not** filter active today (it maps the
  unpaged list straight to options), so its rule is not "any active definition"
  as the design pass states — it currently offers archived definitions too. The
  recommended follow-up (point it at `STOCK_REFERENCE`) is therefore more than a
  papercut; filed for the parent.
