# #450 — verification evidence (Greptile round 4, decimal totals)

- **Issue**: #450 · **Branch**: `fix/450-outbound-entry-id`
- **Reviewed code HEAD**: `874a7f9b` (supersedes `06fd14fc`; the PR head is `b26af0ae` + these two commits)
- **Base**: `origin/develop` @ `073af118` · **Design**: `.scratch/implementation/450-design.md`

## The finding fixed here

Greptile P1 on `b26af0ae`: `consumeConsumableFromSource` compared an **unrounded**
sum of balances and subtracted unrounded.

- `0.7 + 0.1` is `0.7999999999999999`, so a valid `0.8` request was rejected.
- A subtraction left a residual such as `~2.8e-17`; the picker's predicate
  (`quantity > 0`) still offered that emptied balance as stock.

## The change (two commits)

`06fd14fc` — new `apps/api/src/modules/inventory/inventory.helpers.ts`:

- `roundQuantity(value)` rounds to six decimals, half away from zero, scaling the
  decimal string (`Number(\`${v}e6\`)`) like `roundMoneyToCents`. Consumable
  quantities are fractional, so a money-style cent round would corrupt them.
- Applied at the availability total, each `consumed`, each `left` (so a fully
  consumed balance is deleted, not stored at an epsilon), and the running
  `remaining`. `transferConsumable` shared the same defect and now shares the rule.

`874a7f9b` — hardening from the fresh-context review (findings below):

- `normalizeQuantity` rounds the **request** and refuses one that rounds to zero,
  so a sub-quantum input can no longer write a zero-quantity movement/balance.
- `transferConsumable` compares the source balance **raw**, so a legacy
  7-decimal row cannot satisfy a larger request.
- The movement records the rounded quantity, matching the balance deltas.
- `QUANTITY_MIN = 1e-6` is the single availability predicate in both the picker
  SQL and `listItemStockAtSource`, so a residual below the quantum is empty to
  both surfaces ("excluded by the same predicate the picker uses").
- `roundQuantity`'s exponential fallback rounds half away from zero and
  normalises `-0`.

## Red → green

**Core cases** — `roundQuantity` is new, so the pre-fix state is the old service
body (service stashed, tests held constant):

```
$ cd apps/api && pnpm vitest run src/modules/inventory/outbound-transfer-availability.test.ts
# pre-fix service
Tests  4 failed | 11 passed (15)
  × accepts a request equal to the sum of fractional balances (0.7 + 0.1 = 0.8)
  × leaves no float residual the picker would still offer after a full consume
  × leaves the exact remainder on a genuine partial consume
  × keeps an inbound consumable transfer's fractional remainder exact
# fixed
Tests  17 passed (17)
```

**Hardening cases** — the three source files checked out at `06fd14fc` (tests at
`HEAD` held constant):

```
Tests  6 failed | 15 passed (21)
  × rounds a noisy request before comparing it with the available total
  × rejects a request below the storage quantum instead of writing a zero movement
  × rejects an inbound request below the storage quantum before touching a balance
  × keeps an inbound movement equal to its balance deltas on a noisy request
  × rejects an inbound request above a fractional stored balance
  × treats a sub-quantum balance as empty in both the picker and the gate
# at 874a7f9b
Tests  21 passed (21)
```

The sharp residual case (`0.1 + 0.2` requested as `0.3`): the unrounded total
`0.30000000000000004` **passes** the old comparison, so pre-fix it fails only
because the subtraction stores `2.7755575615628914e-17` and the picker still
returns the definition.

## Commands run

| Check | Command | Result |
| --- | --- | --- |
| Inventory module (9 files incl. new) | `cd apps/api && pnpm vitest run src/modules/inventory` | 132 passed |
| Integration + reports (3 files) | `pnpm vitest run src/tests/integration/inventory-transfer-workflow.test.ts src/tests/integration/project-cost-materials.test.ts src/rpc/handlers/reports.test.ts` | 20 passed |
| Contracts | `pnpm --filter @tuari/contracts test` (round-4 baseline, contracts untouched) | 247 passed |
| Typecheck | `pnpm typecheck` | 4 successful, 0 errors |
| Lint | `pnpm lint` | 0 errors |

## Not covered / deferred (decision needed)

- **`createOutboundTransfer` returns the wrong envelope.** The service returns a
  bare transfer record while `inventoryOutboundTransfersCreate` declares
  `createEntityResultSchema` (`packages/contracts/src/inventory-contract.ts:141`),
  so the ORPC client shows `Output validation failed` after a **successful**
  write. Present on `origin/develop`; not introduced here. This is why the
  requested UI recording could not show a clean success.
- **The V2 multi-source picker sends entry/asset-unit ids** where the API
  resolves a definition id (`multi-source-item-picker.tsx:59,83`), so it is
  rejected with `NOT_FOUND`. Also present on `origin/develop`.
- The UI before/after recording was attempted (API + web booted, user
  bootstrapped, demo data seeded); the flow writes the balances correctly but
  the client cannot render a success because of the envelope bug above. No
  evidence asset was uploaded, deliberately, rather than ship a GIF whose
  "after" frame is a pre-existing unrelated error.
