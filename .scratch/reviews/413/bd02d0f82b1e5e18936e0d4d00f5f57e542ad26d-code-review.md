# #413 stock charge - PR #422 round-3 code review

- mode: remote
- base ref: `develop`; merge-base `199798b`; round-3 parent `07c8d39`
- reviewed HEAD: `bd02d0f82b1e5e18936e0d4d00f5f57e542ad26d`
- diff: `git diff 07c8d39...HEAD` (round-3 delta; full-branch evidence is in
  `4750aba-*.md` / `f69630d-*.md`)
- tier: High-assurance (financial calculation)

Process note: the two-axis code review is a lane review. The independent
fresh-context review for this round is the critic/defender debate in
`bd02d0f-debate.md` (both subagent runs completed). A separate standards/spec
subagent fan-out was stopped by the operator before completion, so this file
covers both axes directly rather than claiming an independent run it did not
get.

## Standards

Sources: `AGENTS.md`, `docs/engineering-workflow.md`, `.agents/wisdom/*.md`, and
the Fowler smell baseline.

- **One money rule preserved.** The write gates still parse the single shared
  schema `nonNegativePaymentAmountSchema` (`inventory.ts:283,373,403`), which
  shares `MAX_MONEY_DZD` with `paymentAmountSchema`
  (`packages/contracts/src/payment.ts:20,28`). The new read shape is defined
  once (`storedMoneyDzdSchema`, `payment.ts:49`) and applied at the five
  persisted-money read fields (`inventory.ts:57,101,103,119,156`). No second
  money comparison was hand-rolled.
- **Module-seam defense-in-depth intact.** The invoice path still re-parses the
  asset price through the write schema (`inventory.service.ts:81` + `:368`),
  and the charge amount is still gated in `AssetChargeService.parseAmount`; the
  round-3 change touches only read shapes.
- **Typed errors preserved.** The aggregate refusal remains
  `InventoryError("BUSINESS_RULE", …, field "totalDzd")` and the default refusal
  remains `InventoryError("VALIDATION", …, field "amountDzd")`; no new error
  path.
- **Comments now match the code.** `bd02d0f` corrected the
  `inventoryProjectChargesSchema` comment (the total is computed at read time,
  not a stored value) and scoped the `storedMoneyDzdSchema` doc to the columns
  this change touches. This was the one real standards defect the debate found
  (F6); it is fixed.
- **Smells:** none introduced. No duplication (the split removes the
  write-bound-inside-a-response shape), no speculative generality, no feature
  envy. Judgement call recorded: the read shape is deliberately permissive, so
  its name and doc must carry the rationale - they do.

Hard violations: none. Tooling (lint/typecheck/unslop) is green.

## Spec

Spec sources: the parent finding (quoted in the debate file) and
`.scratch/implementation/413-design.md` ("Review round 3").

| Parent requirement | Implemented | Pinning evidence |
| --- | --- | --- |
| Existing asset above the bound still reads back through detail/list responses | yes: `inventoryAssetUnitSchema.purchasePriceDzd` uses `storedMoneyDzdSchema`; the composites that embed it parse an above-bound row | contracts "reads back an asset stored above the write bound through the detail and list responses (#413 round 3)" (asset-detail, invoice-detail, location-contents + charge/revision read shapes); API "reads back a stored asset whose price predates the money bound through the location list" |
| The input schema keeps the bound - no new above-bound price can enter | yes: `inventoryAssetUnitCreateInputSchema.purchasePriceDzd` still `nonNegativePaymentAmountSchema`; invoice create input inherits it; the module seam still refuses | contracts "bounds the invoice asset purchase price INPUT with the same money rule as the charge"; API `inventory-transfer-charge.test.ts` "refuses an above-bound purchase price before writing anything" |
| The charge default still refuses to use an unrepresentable price | yes: `amountDzd` stays bounded; a legacy price with no prior charge throws `VALIDATION`; with a valid last charge the legacy price is echoed only | contracts "refuses to USE an unrepresentable default while echoing a legacy above-bound price"; API `AssetChargeService` "fails clearly when the resolved default is above the shared money bound" + "reads back a legacy above-bound purchase price when the amount comes from a last charge" |
| Check every other response schema bounded in this branch | yes: the charge amount, revision amounts and echoed default price were bounded by this branch and are now read-permissive; only the computed project total stays bounded (round-2 requirement, documented) | see above + the debate synthesis |

Missing / partial: none within the finding's scope.

Scope creep: none. The only change beyond the finding is a one-line defensive
normalization of a rogue `undefined` last-charge amount (`bd02d0f`), directly in
the touched read path.

Implemented-but-wrong: none found. The retained project-total refusal is a
deliberate round-2 decision, not a regression; the design doc records the
reasoning.

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/contracts build` | pass |
| `pnpm --filter @tuari/contracts test --maxWorkers=2` | 4 files / 175 tests pass |
| `pnpm --filter @tuari/api exec vitest run src/modules/inventory --maxWorkers=2` | 5 files / 51 tests pass |
| `pnpm --filter @tuari/web exec vitest run src/features/inventory --maxWorkers=2` | 5 files / 50 tests pass |
| `pnpm typecheck` | 4 tasks pass |
| `pnpm lint` | 2 tasks, 0 errors |
| `pnpm check:unslop` | PASS |
