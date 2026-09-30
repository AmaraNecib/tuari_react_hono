# Debate — outbound item picker availability (#465)

Reviewed commit `918290aa` (fix commit `dfdaad48` + this lane's review fixes).
Base `551948e4` (`origin/develop`). Method: `debate` (critic + defender, fresh
context), synthesised by the lane owner. Every verdict below is backed by the
code path or a test.

## Synthesis — findings and verdicts

| # | Sev | Finding | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| H1 | High | A pick made at one source survived a source change: `ItemOptionPicker` force-prepends a held selection and the page never cleared it, so warehouse A's item stayed offered and submittable after switching to B. | **Fixed** in `918290aa` | `outbound-transfer-create-page.tsx` `clearItemOptions`; test "clears a row's picked item when the source changes…" fails on `dfdaad48` (picker reads `cement`) and passes now. |
| H2 | High | No test proved two `OUTBOUND_PICK` sources get separate query keys; a source-less `itemUsageKey` would let one source serve the other's cached page. | **Fixed** in `918290aa` | New test in `inventory-hooks.test.tsx`. Fails when `itemUsageKey`'s `OUTBOUND_PICK` branch returns `"OUTBOUND_PICK"`. |
| M1 | Med | `matchesItemOfferFilter` is never called with an `OUTBOUND_PICK` usage in production (the outbound write gate is #450), so the "two evaluators" claim is true of the functions but not of the live write path. | **Deferred to #450** (parent decision); contract doc corrected so it no longer overclaims | `inventory.service.ts:393,417` are `INVOICE_LINE` only; `createOutboundTransfer` keeps its own check. `inventory-item-usage.ts` comment now states the write side lands with #450. The brief forbids touching the write gate. |
| M2 | Med | The equivalence test's JS candidate was a hand mirror of the fixture literal (`candidateOf(fixture)`), so the sweep proved SQL agreed with a written expectation, not with a projection of the seeded rows. | **Fixed** in `918290aa` | `candidateOf(db, fixture)` now reads `inventory_consumable_balance` (`quantity > 0`) and `inventory_asset_unit ⋈ inventory_entry`; the sweep still passes and both mutation proofs below still hold. |
| M3 | Med | "A balance row at zero quantity would be offered" — SQL has `quantity > 0`, the JS candidate has no quantity, so the boundary looked untested. | **Disproven by the schema** | `inventory_consumable_balance_quantity_check CHECK ("quantity" > 0)` (`schema-definitions.ts:451`). A zero/negative balance is not representable, so the clause is defence-in-depth. No test can seed one. |
| M4 | Med | "A balance/asset row with both `warehouse_id` and `project_id` is offered at both sources." | **Disproven by the schema** | `inventory_consumable_balance_destination_check` and `inventory_asset_unit_current_destination_check` both `CHECK (NOT (both set))` (`schema-definitions.ts:453,431`). The write paths also null the opposite side (`inventory.service.ts:680-681`). |
| L1 | Low | Rows keyed by array index, so deleting a row migrated the next row's picker-local search state. | **Fixed** in `918290aa` | `ItemEditorRow.id` + `key={item.id}`. |
| L2 | Low | `addItem`/`removeItem`/`updateItem` read `items` from the render closure instead of the functional updater. | **Fixed** in `918290aa` | `setItems((prev) => …)`. |
| L3 | Low | The submit mapping (`itemOption.id` → `itemId`) and its validation had no test after the diff deleted the old catalog-membership check. | **Fixed** in `918290aa` | New "submits the picked option's id with the typed quantity" test. |
| L4 | Low | The picker reuses invoice-scoped i18n keys on the outbound surface; the page still has hard-coded Arabic validation strings. | **Dismissed (pre-existing, not made worse)** | `item-option-picker.tsx` is unchanged by this diff; the hard-coded strings predate `dfdaad48` and the diff removed one of them. Not a #465 regression. |
| L5 | Low | The two correlated `EXISTS` subqueries run per candidate row and again for `count()`; index coverage unverified. | **Not verifiable in this lane** | Read-only review could not confirm indexes; no behavioural impact. Noted, not fixed. |
| — | Med-High | `createOutboundTransfer` divergences (definition id passed as entry id, asset branch ignores `itemDefinitionId`, no `isActive`) — the picker can offer what the gate refuses or vice versa. | **Reported only, #450** | Per the brief: "Do NOT touch the outbound write gate". Documented in the design doc risk section. |

## What the defender got right (kept)

- The rule is data in one place (`resolveItemOffer`), both evaluators read it,
  and the cursor scope folds in the source (`WAREHOUSE:<id>` / `PROJECT:<id>`),
  with a reset test.
- The two-table SQL predicate ignoring definition type is consistent with the JS
  evaluator (which also ignores `itemType` when reading stock ids); both tables
  are frozen to the definition type by the entry-reference guard.
- Deferring the write-gate mismatch is defensible because the payload shape is
  unchanged from the base and the correct repair is one shared stock read
  (#450).
