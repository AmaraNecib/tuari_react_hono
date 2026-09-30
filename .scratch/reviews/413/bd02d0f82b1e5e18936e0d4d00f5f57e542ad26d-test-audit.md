# #413 stock charge - PR #422 round-3 test audit

- mode: remote
- base ref: `develop`; merge-base `199798b`; round-3 parent `07c8d39`
- reviewed HEAD: `bd02d0f82b1e5e18936e0d4d00f5f57e542ad26d`
- tier: High-assurance (financial calculation)

Process note: run as a lane audit (edge-case hunter + coverage analyst +
quality reviewer lenses together) because the focused test-audit subagent
fan-out was stopped by the operator. The independent cross-check for this round
is the debate in `bd02d0f-debate.md`.

## What round 3 added

`packages/contracts/src/index.test.ts` (contracts, 175 tests total):

- "bounds the invoice asset purchase price INPUT with the same money rule as the
  charge" - `MAX_MONEY_DZD` accepted, `MAX + 1` refused, both for the bare asset
  input and nested in the invoice create input.
- "reads back an asset stored above the write bound through the detail and list
  responses (#413 round 3)" - an asset with `purchasePriceDzd = MAX + 1` parses
  through `inventoryAssetUnitSchema`, `inventoryAssetDetailSchema`,
  `inventoryInvoiceGroupDetailSchema` (entry + asset),
  `inventoryLocationContentsSchema`, and pins that an above-bound
  `inventoryAssetChargeSchema.amountDzd` / revision `previousAmountDzd` parses.
- "refuses to USE an unrepresentable default while echoing a legacy above-bound
  price (#413 round 3)" - `purchasePriceDzd = MAX + 1` with a valid `amountDzd`
  parses; `amountDzd = MAX + 1` does not.
- "storedMoneyDzdSchema is a permissive read boundary..." - `MAX + 1` and `0`
  parse; `-1`, `-0.5`, `NaN`, `Infinity`, `-Infinity` do not.

`apps/api/src/modules/inventory/asset-charge.service.test.ts`:

- "reads back a legacy above-bound purchase price when the amount comes from a
  last charge" - a legacy `MAX + 1` price with an existing charge resolves
  `{ amountDzd: 80_000, purchasePriceDzd: MAX + 1, source: "LAST_CHARGE" }`.
- Existing "fails clearly when the resolved default is above the shared money
  bound" still pins the no-prior-charge refusal (`/خارج النطاق/`).

`apps/api/src/modules/inventory/inventory-transfer-charge.test.ts`:

- "reads back a stored asset whose price predates the money bound through the
  location list" - `getLocationContents` returns the row and
  `inventoryLocationContentsSchema.safeParse` succeeds; the value is not clamped.
- Existing "refuses an above-bound purchase price before writing anything" still
  pins the module seam.

## Coverage against the parent requirements

| Requirement | Test | Verdict |
| --- | --- | --- |
| Above-bound stored price reads back through detail/list | contracts composite test + API location-list test | covered |
| Above-bound input still refused | contracts input test + API seam test | covered |
| Charge default still refuses to use an unrepresentable price | API no-prior-charge refusal (existing) + contracts default test | covered |
| Same over-tightening elsewhere in the branch | charge/revision/default read shapes pinned; `totalDzd` bounded per round-2 | covered |

## Edge cases

- Boundary exactly `MAX_MONEY_DZD`: accepted on input and read; `MAX + 1`
  refused on input, accepted on read. Covered.
- Negative / zero / non-finite on the read shape: explicitly covered by the new
  `storedMoneyDzdSchema` test; write gates already covered.
- Legacy price with a valid last charge vs. no last charge: both branches of
  `resolveDefault` are pinned.
- Legacy price through a list response: pinned at the API layer, not only at the
  schema layer.
- Not covered (accepted): the API `getAsset` detail path is not driven end to
  end with a legacy price - the harness returns a partial invoice group, so the
  contracts test parses `inventoryAssetDetailSchema` with a full payload
  instead. The service returns repository records unchanged, so the schema test
  is the load-bearing one.
- Not covered (accepted): the `?? null` normalization of a rogue `undefined`
  last-charge amount is defensive; the repository interface types the value as
  `number | null`, so there is no reachable `undefined` to drive.

## Quality

- Names describe the behaviour and the round; assertions use
  `safeParse(...).success` on full payloads rather than partial shapes.
- Tests are synchronous and isolated; no new shared mutable fixtures.
- The API list test adds two additive repository double methods to the existing
  harness (no change to existing cases).
- No duplicate coverage: the contracts test and the API tests sit at different
  layers (schema vs. service wiring).

Grade: A-. The only deduction is the absent end-to-end asset-detail API test
noted above, which is a harness limitation rather than a missing assertion.

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts test --maxWorkers=2` | 4 files / 175 tests pass |
| `pnpm --filter @tuari/api exec vitest run src/modules/inventory --maxWorkers=2` | 5 files / 51 tests pass |
| `pnpm --filter @tuari/web exec vitest run src/features/inventory --maxWorkers=2` | 5 files / 50 tests pass |
