# #413 stock charge — test audit

- reviewed HEAD: `f69630d22271c407b915a43149cc12fa01123848`
- base SHA: `17911dc14211730bec6982707f518b4c84dafa19`

## What the tests pin

| Required behaviour | Test |
| --- | --- |
| first placement defaults to purchase price | `asset-charge.service.test.ts` → "first placement defaults…" |
| second placement defaults to the previous amount | → "second placement defaults to the previous amount…" |
| percentage ↔ amount linkage | `transfer-item-dialog.test.tsx` (cut/above, conversion, exact round-trip, zero price, blank) |
| zero/blank amount = free placement | service "explicit zero…" + `parseChargeAmountInput` blank cases |
| warehouse destination writes no charge | `inventory-transfer-charge.test.ts` → "writes no charge…" |
| correction keeps from → to + reason + actor | service "records a correction as from → to…" |
| void keeps history, drops from the total | service "voids a charge (from → null)…" |
| per-project total | service "sums only live charges…" |
| charge belongs to the placement (movement ref) | transfer test asserts `movementId` |
| transfer rollback leaves no charge | transfer test "rolls the charge back…" |
| chain ordering is insertion order | sqlite adapter test "keeps insertion order … one millisecond" |
| update + revision commit together / roll back together | sqlite adapter tests |
| FK integrity | sqlite adapter "enforces the foreign keys" |
| correction/void UI | `asset-charge-history.test.tsx` |
| schema shape | `schema-definitions.test.ts` (#413 block) |
| contract shape + procedures | `packages/contracts/src/index.test.ts` (#413 block) |

## Edge cases checked

- negative / non-finite amount rejected at the service boundary and by the wire
  schema.
- amount above the purchase price is accepted (warns, never blocks).
- editing or voiding an already-voided charge is refused.
- unknown charge id / invalid payload rejected before the repository write.
- unknown asset / unknown project rejected.
- blank correction reason normalizes to null; omitted audit context defaults.
- purchase price 0 disables the percentage (division undefined).

## Gaps / limits

- No Playwright E2E added. The transfer dialog and charge history are covered by
  jsdom component tests; a browser-level flow was not run in this lane.
- The scoped coverage run covers `asset-charge.service.ts` (100% statements,
  branches, functions, lines). Adapters are excluded by the API vitest config's
  `exclude: ["**/adapters/**"]`; they are covered by the sqlite/in-memory
  integration tests but not by a coverage number.
- `!updated` defensive branches after `requireLiveCharge` are marked
  `/* v8 ignore start/stop */` (unreachable: the charge is read under the same
  transaction immediately before the update).
