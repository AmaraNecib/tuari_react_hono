# #450 — verification evidence (Greptile round 4)

- **Issue**: #450 · **Branch**: `fix/450-outbound-entry-id`
- **Reviewed code HEAD**: `8fa6c9f8` (supersedes the `b26af0ae` PR head; adds `06fd14fc`, `874a7f9b`, `c775f736`, `8fa6c9f8`)
- **Base**: `origin/develop` @ `073af118` · **Design**: `.scratch/implementation/450-design.md`

## What this round fixes

### 1. The Greptile P1 (decimal totals)

`consumeConsumableFromSource` compared an **unrounded** sum of balances and
subtracted unrounded: `0.7 + 0.1` is `0.7999999999999999`, so a valid `0.8`
request was rejected, and a subtraction left a `~2.8e-17` residual the picker's
`quantity > 0` still offered as stock.

`new inventory.helpers.ts` adds `roundQuantity` (six decimals, decimal-string
scaling like `roundMoneyToCents`, no forced cents). It is applied to the
availability total, each `consumed`, each `left` (a balance that reaches the
total is deleted, not stored at an epsilon), and the running `remaining`. The
sibling `transferConsumable` shared the defect and shares the rule.

### 2. Sub-quantum and parity hardening (from the round-4 review)

`normalizeQuantity` rounds the **request** and refuses one that rounds to zero
(a sub-quantum input previously wrote a zero-quantity movement / raw SQL CHECK
error); `transferConsumable` compares the source balance **raw**; the movement
records the rounded quantity; `QUANTITY_MIN = 1e-6` is the single availability
predicate in both the picker SQL and `listItemStockAtSource`;
`roundQuantity`'s exponential fallback rounds half away from zero and normalises
`-0`.

### 3. The outbound create envelope (parent decision 1)

`createOutboundTransfer` returned a bare record while
`inventoryOutboundTransfersCreate` declares `createEntityResultSchema`; the web
hook already calls `requireEntitySuccess(...).item`. Every successful write
surfaced as `Output validation failed`. Wrap it in `successResult`, like every
other create handler. Pinned by the new envelope test.

### 4. The V2 picker definition-id mismatch (parent decision 2)

`MultiSourceItemPicker` (the outbound V2 page) sent `inventory_entry_id` and
asset-unit ids where the write gate resolves a **definition** id. It now sends
the definition id for consumables (`balance.itemDefinitionId`) and for assets
(a new optional `itemDefinitionId` on the asset read, resolved by the location
listing in `listAssetUnitsByLocation`). A new `optionId` keeps the concrete row
for dedupe, so two balances or units of one definition can both be picked.

## Red → green

Core decimal cases (service stashed, tests held constant):

```
$ cd apps/api && pnpm vitest run src/modules/inventory/outbound-transfer-availability.test.ts
# pre-fix service
Tests  4 failed | 11 passed (15)
  × 0.7 + 0.1 accepts 0.8
  × full consume leaves no residual the picker offers
  × genuine partial keeps 0.5
  × inbound partial
# fixed
Tests  17 passed (17)
```

Hardening cases (three source files at `06fd14fc`):

```
Tests  6 failed | 15 passed (21)   # sub-quantum, noisy request, raw compare, delta, parity
Tests  21 passed (21)              # at 874a7f9b
```

Envelope case (service at `b26af0ae`):

```
$ pnpm vitest run --config <temp alias> src/modules/inventory/outbound-transfer-availability.test.ts -t "returns the create envelope"
Tests  1 failed | 21 skipped (22)   # bare record
Tests  22 passed (22)               # at 8fa6c9f8
```

## Commands run

| Check | Command | Result |
| --- | --- | --- |
| Inventory module (9 files) | `pnpm vitest run src/modules/inventory` | 132 passed |
| RPC + integration (3 files) | `pnpm vitest run src/rpc/handlers/reports.test.ts src/rpc/router.test.ts src/tests/integration/inventory-transfer-workflow.test.ts` | 68 passed |
| Contracts | `pnpm vitest run src/index.test.ts` | 117 passed |
| Envelope test (final) | `pnpm vitest run --config <temp alias> src/modules/inventory/outbound-transfer-availability.test.ts` | 22 passed |
| Typecheck | `pnpm typecheck` | 4 successful, 0 errors |
| Lint | `pnpm lint` | 0 errors |

The later runs used a temporary vitest config that aliases `@tuari/contracts` to
`packages/contracts/src/index.ts`, because a concurrent lane repointed the shared
`node_modules` link at an unbuilt sibling worktree mid-session.

## Not delivered: the before/after GIF

The recording was attempted end to end: API + web booted on a throwaway DB, the
first user bootstrapped, demo balances `0.7 + 0.1` seeded, and the V1 outbound
flow scripted through `agent-browser batch`. Two blockers stopped it:

1. The shared `apps/api/node_modules/@tuari/contracts` symlink was repointed at
   23:01 by the concurrent `fix-encryption-fallback` lane to a worktree whose
   `dist` is not built, so the API process could not resolve `@tuari/contracts`
   and crashed mid-recording.
2. The batch's `open`/`record start` re-launched the browser context, dropping
   the bootstrapped session so the create page rendered empty.

Repointing the shared link at my build would sabotage the other lane, so I did
not. Re-run the recording when the fleet is quiet and one contracts build owns
the shared link.
