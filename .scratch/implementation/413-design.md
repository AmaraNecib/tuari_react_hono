# 413 — Charge a price to a project when a stock unit is moved onto it

mode: remote
ticket: AmaraNecib/tuari_react_hono#413 (stock charge / عتاد مخصّص)
target ref: develop
declared base SHA: 17911dc14211730bec6982707f518b4c84dafa19 (local `develop` ref)
effective branch point: cacefb8d6b20473146ae681f02ef4c4c8f8a6337 (the worktree HEAD
at start; local `develop` was stale — `origin/develop` had advanced to c5334cc,
and the license commits between 17911dc and cacefb8 are pre-existing branch
context, not part of this lane)
review tier: High-assurance (financial calculation: money charged to a project)

## Settled rules (from `.scratch/prototype/NOTES.md` → "Stock charge")

- Moving a unit to a **project** asks for an amount; moving to a **warehouse**
  writes no charge.
- Default amount = the last amount charged for that unit, else `purchasePriceDzd`.
- UI shows the amount as a percentage of the purchase price (negative = cut,
  positive = above) and lets either field drive the other. Above purchase price
  warns, never blocks.
- The charge belongs to that **placement** (the transfer movement). A later move
  starts a new charge; the earlier project keeps its charge.
- A past charge stays editable; a correction records from → to, actor,
  timestamp, optional reason.

## Public surface

### Contracts (`@tuari/contracts`)

- `nonNegativePaymentAmountSchema` (payment.ts) — shares the single money rule
  constant `MAX_MONEY_DZD = Number.MAX_SAFE_INTEGER` with `paymentAmountSchema`;
  only the sign bound differs, because a free placement (0) is legal. This is the
  WRITE gate.
- `storedMoneyDzdSchema` (payment.ts) — `z.number().nonnegative()`, the READ
  shape for a persisted DZD column. Deliberately unbounded by magnitude because
  the DDL only enforces `>= 0` and earlier versions accepted any non-negative
  REAL, so an existing row can sit above `MAX_MONEY_DZD` (#413 round 3).
- `inventoryAssetChargeSchema`, `inventoryAssetChargeRevisionSchema`,
  `inventoryAssetChargeDetailSchema`, `inventoryProjectChargesSchema`,
  `inventoryAssetChargeDefaultSchema`.
- `inventoryAssetTransferInputSchema.chargeAmountDzd` — optional; **omitted /
  null → server resolves the default**, explicit `0` → free placement.
- New procedures (inventory-contract.ts):
  `inventoryAssetChargesListByUnit`, `inventoryAssetChargesListByProject`
  (charges + total), `inventoryAssetChargesUpdate`, `inventoryAssetChargesVoid`,
  `inventoryAssetChargeDefault`.
- `inventoryAssetDetailSchema` gains `charges`, so the unit view renders history.

### Schema

- `inventory_asset_charge` (unit, project, movement reference, amount, status,
  void metadata, actor/timestamps).
- `inventory_asset_charge_revision` (charge, previous → new amount, reason,
  actor, created_at) — the "existing audit pattern" (`user_profile_history`,
  `debt_entry` void metadata) rather than a new invented shape; there is no
  expenses module in the tree yet.
- Drizzle tables in `apps/api/src/schema/inventory.ts`; idempotent DDL +
  indexes in `schema-definitions.ts`; pinned by a schema-definitions test.

### API module

New `AssetChargeService` + `AssetChargeRepository` port with sqlite and
in-memory adapters, kept separate from the large `InventoryRepository` so the
in-memory double stays small. The sqlite adapter uses the **shared
`connectionLock` + `runSyncTransaction`**, so the charge write joins the
transfer's open transaction as a SAVEPOINT (never absorbed by another flow).

`InventoryService.transferAsset(input.assetChargeService?)`:
destination project → create movement, then create the placement charge in the
same `withTransaction`; destination warehouse → movement only.

### Web

- `TransferItemDialog` asks for the amount when the destination is a project:
  prefill from `inventoryAssetChargeDefault`, amount ↔ percentage linkage,
  above-purchase-price warning, free (0) allowed.
- `AssetChargeHistory` renders the unit's charge chain, wired into the location
  contents asset rows (the unit's detail view).

## Tests

- default: first placement → purchase price; second → previous amount.
- percentage ↔ amount linkage (unit test of the derived helper).
- zero/blank → free placement, allowed.
- warehouse destination writes no charge.
- correction keeps from → to + reason; void hides from the total.
- per-project total sums only LIVE charges.
- schema-definitions table shape + contract exports.

## Risks / migration

- Additive tables only (`CREATE TABLE IF NOT EXISTS`), no column migration.
- Older UI/transfers that omit `chargeAmountDzd` resolve the default server-side,
  so no behavior regression for callers that never knew about charges.
- Money is REAL like every other DZD column; the schema bound mirrors the
  existing payment rule.

## Review round — PR #422 (10 findings)

Reviewed HEAD was `e74c377`; the fixes below were applied on top of it. Decisions
that a later reader would otherwise have to reverse-engineer:

1. **A unit created directly on a project is charged.** `createInvoiceGroup`
   now books the placement charge for an ASSET entry with a project destination
   in the same transaction as the purchase movement (default = purchase price,
   because a fresh unit has no prior charge). Warehouse purchases still write
   none. Pinned by `inventory-transfer-charge.test.ts`.
2. **One transfer entry point for assets.** The invoice-details screen no longer
   posts `inventoryAssetsTransfer` directly; it opens `TransferItemDialog`, so
   the operator can state the charge from every path. (The inline warehouse/
   project selects on that screen were also permanently disabled by a
   setter-less `transferSectionExpanded` flag; the shared dialog removes them.)
3. **Amount entry is three-valued.** `parseChargeAmountInput` distinguishes
   blank (`default`), a valid amount (`amount`, explicit `0` = free) and a
   non-blank invalid value (`invalid`). Invalid input is rejected with an
   inline error and blocks submit; it is never coerced to a free placement.
   `chargeAmountFromPercent` clamps at 0 so a >100% cut cannot synthesise a
   negative amount.
4. **The resolved default is validated.** `resolveDefault` parses its result
   with `inventoryAssetChargeDefaultSchema`, so a purchase price (or stored
   amount) above `MAX_MONEY_DZD` fails with a clear error instead of emitting a
   payload the wire contract rejects.
5. **A live default refetch never overwrites an edit.** The prefill effect only
   applies while the amount field is untouched (`amountTouched`); a correction
   landing in another tab updates only an untouched field.
6. **Project totals are rounded at the boundary** with the shared
   `roundMoney` helper (`../company/report.helpers`), the same one the report
   aggregators use, so `0.1 + 0.2` cannot drift.
7. **Revisions are inspectable.** `AssetChargeHistory` renders each revision's
   from → to amount, actor, timestamp and reason, instead of collapsing the
   whole chain to a "corrected" badge.
8. **Loading, error and empty are distinct.** The history shows a loading line,
   an error surface, or the genuine empty state — never an empty list standing
   in for a pending/failed query.
9. **The rollback test exercises rollback.** The in-memory transaction double
   snapshots the charge/revision/movement/location state and restores it on
   throw; a `failAfterCharge` hook inserts the charge and then fails. The test
   asserts the charge, revision, movement and location change are all gone. The
   invalid-amount case is kept as its own (pre-insert) test.
10. **Money records outlive a project delete.** `inventory_asset_charge.project_id`
    is `ON DELETE RESTRICT` (was CASCADE). Chosen over `SET NULL` because the
    column is NOT NULL and the project reference is part of the charge's
    identity, and over keeping a nulled row because a charge without a project
    is not a project charge. No project-delete path exists in the app today, so
    there is no behavior regression; a delete now fails loudly instead of
    destroying the record. Pinned by a schema-definitions test and a real
    sqlite FK test.

### Trade-offs / accepted

- `inventory_asset_charge.asset_unit_id` remains `ON DELETE CASCADE`: the chain
  belongs to the unit, and a charge for a deleted unit has no subject. Only the
  project FK (the finding) was changed.
- `purchasePriceDzd` in the default response shares the same contract bound and
  is validated by the same `inventoryAssetChargeDefaultSchema` parse. (Corrected
  by round 3: the echoed price uses the permissive stored shape; the resolved
  `amountDzd` keeps the bound.)

## Review round 2 — PR #422 (money-bound findings)

Round 1 (finding 4) validated the *resolved charge default* against
`MAX_MONEY_DZD` but left the invoice asset input and the asset entity schema on
an unbounded `z.number().nonnegative()`. That introduced TWO ceilings for the
same money field: a purchase price the invoice path accepted could make the
charge default (and therefore a direct-to-project purchase) fail, while the
same purchase into a warehouse succeeded. Greptile flagged this as "valid
purchase prices now fail" (P2), plus the symmetric aggregate leak "project
totals exceed contract bound" (P2).

One bound wins, and it is the contract's `MAX_MONEY_DZD`:

1. **The invoice asset price is bounded at the same ceiling.**
   `inventoryAssetUnitCreateInputSchema.purchasePriceDzd` and the entity/"storage"
   shape `inventoryAssetUnitSchema.purchasePriceDzd` both use
   `nonNegativePaymentAmountSchema` (the same `MAX_MONEY_DZD` rule as the charge
   contract). `InventoryService.createInvoiceGroup` also parses the price with
   that schema at the module seam, so the wire gate and the service cannot
   drift (the #289 defense-in-depth pattern) and a direct service call cannot
   store above-bound money. There is no evidence the invoice path needs a
   higher ceiling: `MAX_MONEY_DZD` is a *precision* bound
   (`Number.MAX_SAFE_INTEGER`), not a business limit, so the only values it
   rejects are ones whose arithmetic is already undefined.
2. **The project total has its own aggregate bound.** Individual charges are
   each allowed to reach `MAX_MONEY_DZD`, so their sum can exceed it and the
   `inventoryProjectChargesSchema.totalDzd` contract cannot represent it.
   `listByProject` now sums with an incremental guard and throws a typed
   `InventoryError("BUSINESS_RULE", …)` before rounding, instead of emitting a
   number outside the declared shape. A total that lands *exactly* on the bound
   is still representable and still returned.

Trade-off: bounding `inventoryAssetUnitSchema` means a legacy row whose price
already exceeds `MAX_SAFE_INTEGER` would no longer serialize. Accepted because
(a) the invoice input has always fed this path and the new gate stops any new
above-bound row, (b) `MAX_SAFE_INTEGER` is the point past which the stored
`number` is no longer an exact integer, and (c) the alternative (an unbounded
read schema next to a bounded write schema) is exactly the two-ceiling bug
being fixed.

## Review round 3 — PR #422 (read schema was over-tightened)

Round 2 closed the two-ceiling gap, but it bounded `inventoryAssetUnitSchema`
itself — a schema that is not only an input. Asset-detail, invoice-detail and
location-contents RESPONSES all embed it, and the database already holds asset
rows the old (unbounded) input accepted. Any such row would now fail output
validation and break the screen that merely displays it. The round-2 trade-off
above was wrong: a read path must never be the thing that fails on data the
system itself stored.

The fix separates the two concerns instead of picking one ceiling:

- **Write gates keep the bound.** `inventoryAssetUnitCreateInputSchema`,
  `inventoryAssetTransferInputSchema.chargeAmountDzd`,
  `inventoryAssetChargeUpdateInputSchema` and the
  `InventoryService.createInvoiceGroup` module seam all use
  `nonNegativePaymentAmountSchema`, so no new above-bound value can enter.
- **Read shapes are permissive.** Every persisted money column this change
  touches is read with `storedMoneyDzdSchema`:
  `inventoryAssetUnitSchema.purchasePriceDzd`,
  `inventoryAssetChargeSchema.amountDzd`,
  `inventoryAssetChargeRevisionSchema.previousAmountDzd`/`newAmountDzd`, and the
  echoed `inventoryAssetChargeDefaultSchema.purchasePriceDzd`. A stored row
  always reads back. Only `purchasePriceDzd` has genuine legacy rows; the charge
  and revision tables are new, so there they are defense in depth — the DDL's
  real domain is `>= 0`, and a read must not depend on the write gate's bound.
  (Pre-existing bounded reads in other modules - payments, expenses - are out of
  this branch's scope and still open.)
- **Values the app USES keep the bound.** The resolved
  `inventoryAssetChargeDefaultSchema.amountDzd` and the computed
  `inventoryProjectChargesSchema.totalDzd` stay bounded, and the service refuses
  (`VALIDATION` / `BUSINESS_RULE`) rather than emitting an unrepresentable
  number. A stored double round-trips losslessly; a SUM above `MAX_MONEY_DZD`
  does not, which is why only the aggregate is refused (a deliberate round-2
  choice). A legacy above-bound price still reads back and still reads back in
  the unit's charge chain; it is refused only where it would be USED as a new
  charge amount or folded into a total.

Tests: `index.test.ts` parses an above-bound stored asset through
`inventoryAssetUnitSchema`, `inventoryAssetDetailSchema`,
`inventoryInvoiceGroupDetailSchema` and `inventoryLocationContentsSchema`, keeps
the write gate refusal, and pins the default's readback-vs-use split;
`asset-charge.service.test.ts` resolves a default for a legacy above-bound price
when a valid last charge exists; `inventory-transfer-charge.test.ts` reads an
above-bound row back through `getLocationContents`.

## Debate round (high-assurance requirement)

The tier requires a debate and the PR had none. Two fresh-context reviewers (a
critic hunting wrong or unrepresentable numbers, a defender arguing the design)
read the branch diff. Synthesis and decisions:

- **Fixed: `roundMoney` corrupted totals above ~9.007e13.** `value * 100`
  overflows IEEE-754 integer precision, so the helper returned
  `MAX_SAFE_INTEGER - 2` for an input of `MAX_SAFE_INTEGER - 1`. The shared
  helper now returns large magnitudes unchanged, because at that magnitude the
  value has no representable cents. Pinned by `report.helpers.test.ts` and a
  near-bound project-total test. The same guard was added to the web copy used
  by the percentage linkage.
- **Fixed: a blank correction amount silently recorded a revision to 0.** The
  history editor used `Number(draftAmount)` and `Number("")` is 0. It now routes
  through the transfer dialog's three-valued `parseChargeAmountInput`, accepts
  only an explicit amount (0 is a free placement), and shows an inline error.
  Pinned by `asset-charge-history.test.tsx`.
- **Fixed: the client amount parser accepted over-bound values.** An amount
  above `MAX_MONEY_DZD`, including one derived from a huge percentage, now
  parses as invalid and blocks submit instead of failing at the wire. Pinned by
  `transfer-item-dialog.test.tsx`.
- **Dismissed: duplicate charge on a same-project re-placement.** `transferAsset`
  already refuses a transfer to the unit's current location with
  `BUSINESS_RULE` ("الأصل موجود بالفعل في هذا الموقع."). The critic missed the
  guard.
- **Reported to the parent, not fixed here: the invoice path still leaves
  consumable `unitPriceDzd`, `grossTotalDzd` and `paidAmountDzd` unbounded.**
  Those fields predate #413, do not feed a charge, and their output contract is
  deliberately unbounded, so this is a pre-existing money-rule gap rather than
  the two-ceiling bug. Proposed as a follow-up.
- **Round-3 debate (fresh-context critic + defender on `0bc1f41`):** fixed the
  round-3 section's overclaim that "every persisted money column" uses the read
  shape (it is every column this change touches), and normalized a rogue
  `undefined` last-charge amount to `null` so the source label and the fallback
  cannot disagree. Kept deliberately: (a) the project-total `BUSINESS_RULE`
  refusal stays in the read service because the aggregate is the value that is
  not representable, unlike a stored double (the critic wanted the guard moved
  to the write seam; that would let a legal pair of charges store an
  unrepresentable total and only fail later); (b) the resolved default still
  refuses an above-bound purchase price with no prior charge, because the
  requirement is to refuse to USE an unrepresentable price - the operator can
  still state an explicit amount.
- **Accepted minors:** `ON DELETE RESTRICT` also blocks deleting a project whose
  only charges are VOIDED, but no project-delete path exists today; the void UI
  collects no reason unless the row was first opened for edit; `getLastChargeAmount`
  orders by insertion (rowid), not the movement's `occurredAt`; the in-memory
  adapter does not persist `voidedBy`; the correction/void pre-read sits outside
  the write transaction, which is unreachable with synchronous better-sqlite3.

## Review round 4 — PR #422 (19:27Z, eight findings)

1. **Write-time aggregate bound.** Two individually valid charges could sum
   above `MAX_MONEY_DZD`, after which every project-total read threw. The
   aggregate is now enforced at WRITE time: `createPlacementCharge` and
   `updateCharge` sum the project's other LIVE charges inside the same locked
   transaction and refuse a write that would exceed the bound with a typed
   `BUSINESS_RULE` error naming the limit and the current total. The read-path
   guard stays as a backstop for a state written before this gate.
2. **Read-check-write under the lock + `AND status='LIVE'`.** Corrections and
   voids now read the charge inside `repository.withTransaction` (the
   `expenses.module.ts` pattern), and the adapter's UPDATE carries
   `AND status='LIVE'` so a second process sharing the database cannot make the
   revision record a stale "from" amount or overwrite a just-voided row.
3. **Failed charge default in the transfer dialog.** A legacy above-bound price
   makes the default query fail; the dialog no longer substitutes 0. It states
   the price is unavailable, keeps the amount field usable for a plain amount,
   and disables percentage entry.
4. **Correction/void reason scoping.** The reason is now tied to the charge
   being acted on: corrections edit a charge-keyed draft, and voids collect
   their own reason before confirm, so A's reason can never be recorded on B.
5. **Invoice-create invalidation.** `useCreateInventoryInvoiceGroupMutation`
   now invalidates the charges query for every project the invoice places
   assets on (the group default plus each entry's project).
6. **N+1 removed.** `listChargesByProject` resolves the project name once and
   attaches it to every row instead of one name query per charge.
7. **Real-SQLite rollback test.** `inventory-transfer-charge.test.ts` drives the
   real adapters over one shared connection + lock, fails after the charge
   insert, and asserts the charge, movement and location change all rolled
   back — the in-memory harness only proved its own snapshot/restore.
8. **No historical backfill (parent decision).** Assets placed on a project
   before #413 have no charge row, so project totals omit them. We do NOT
   invent charges for placements that were never priced — that would fabricate
   project costs. Documented in the `inventory_asset_charge` DDL comment
   (`schema-definitions.ts`) and here: a project charge total covers charges
   recorded from #413 onward. No UI shows the project total yet (#414), so it
   is documented rather than surfaced in-render.

### Round-4 debate (fresh-context critic + defender)

The critic confirmed all eight findings were closed and raised:

- **Fixed: the write-time gate scanned the whole project (and resolved its name)
  once per asset in a bulk invoice.** Added `sumLiveChargesByProject` as a
  single aggregate query on the port; the gate now uses it.
- **Fixed: the correction error reported a "current total" that excluded the
  corrected charge**, so it could not be reconciled with the project view. The
  helper now reports the full LIVE total and subtracts the replaced amount only
  for the overflow test; the write gate and the read backstop share one message
  builder that names the limit and the current total.
- **Fixed: the dialog showed a false `0` price while the default query was still
  pending**, not only when it failed. A pending query now renders a loading
  hint, and a blank amount while the price is unavailable is blocked at submit
  (the server default is exactly the read that failed).
- **Fixed: voiding an already-voided charge used the correction wording.**
  `requireLiveCharge` now takes the action so each path reports its own message.
- **Dismissed: the critic's claim that `getAsset` runs `listByUnit` once per
  asset on the location-contents screen.** `getAsset` is a single-unit detail
  read; the location-contents screen does not call it per asset. `listByUnit`
  still resolves one name per charge, which is correct because a unit's chain
  can span projects, and that path is out of this finding's scope.
- **Accepted, documented: an already-over-bound legacy project cannot be
  corrected downward if the other LIVE charges alone exceed the bound; voiding
  is the escape hatch.** `voidCharge` deliberately skips the aggregate gate, so
  an over-bound project can always be brought back into range.
- **Accepted: `resolveDefault` runs before the write transaction.** With the
  synchronous single better-sqlite3 connection the read cannot interleave; only
  the aggregate check needs the lock, and reading full rows for it does not.

## Review round 5 — PR #422 (21:17Z, seven findings)

1. **One summation for the write gate and the read (correctness).** The gate
   summed through SQLite (`sum()`, rowid order) while the read added in JS
   newest-first, so `MAX`, `0.01` and `0.49` each passed the gate and the read
   then threw. The SQL aggregate is removed: both paths call the one
   `sumLiveCharges(amounts)` with the read's newest-first order. The write gate
   builds the exact post-write list (a placement prepends the new amount; a
   correction swaps the amount at its existing position) and refuses if that
   sum exceeds the bound — so after any accepted write the read is guaranteed
   to succeed. `asset-charge.service.test.ts` adds the exact MAX / 0.01 / 0.49
   sequence and asserts the read succeeds after every accepted write.
2. **A missing charge dependency fails loudly (correctness).** The invoice and
   transfer placement paths no longer `&& this.assetChargeService`-skip the
   charge; they call `requireAssetChargeService()`, so a composition that omits
   it refuses the placement instead of silently booking an uncharged one.
   `inventory-transfer-charge.test.ts` pins the refusal and the empty rollback.
3. **Charge query errors map to the documented envelope (correctness).**
   `queryAuth` gains an optional `errorResolver` (the `mutationAudit` shape);
   `inventoryAssetChargeDefault` and `inventoryAssetChargesListByProject` pass
   `toInventoryFailureResult`, so a missing asset / missing project / unusable
   stored price returns `{ success: false, error }` — the entity result the web
   client's `requireEntitySuccess` reads — instead of an unmapped raw error.
   `router.test.ts` adds one router-level test per error class. The list-by-unit
   procedure's output contract has no failure branch (it is `{ items }`), so it
   is deliberately left unmapped; its only reachable error is the missing
   service, which round 5 makes a wiring fault.
4. **A charge survives its asset and its invoice (correctness).**
   `inventory_asset_charge.asset_unit_id` changes `ON DELETE CASCADE` →
   `ON DELETE RESTRICT` in both the DDL and the Drizzle schema, mirroring the
   project FK. Deleting the unit (directly or through the invoice → entry
   cascade) is refused, so the money record and its revisions stay readable.
   `sqlite-asset-charge.repository.test.ts` pins both the unit delete and the
   invoice delete.
5. **The charge default revalidates on reopen (correctness).**
   `useAssetChargeDefaultQuery` sets `staleTime: 0` and
   `refetchOnMount: "always"`, so reopening the transfer dialog refetches the
   default even inside the global 30s window; the untouched-field rule is
   unchanged, so a value the operator typed is never clobbered.
   `inventory-hooks.test.tsx` pins the re-enable refetch against a 30s test
   client.
6. **N+1 in the charge history removed.** A new
   `listRevisionsByChargeIds(chargeIds)` port method fetches a unit's whole
   revision history in one query (both adapters), and `listChargesByUnit`
   resolves each distinct project name at most once per call.
7. **Failed corrections/voids no longer leak a rejection.** `saveEdit` and
   `confirmVoid` in `asset-charge-history.tsx` await `mutateAsync` inside a
   try/catch that returns on failure (the `expense-form-dialog.tsx` pattern),
   keeping the draft on screen; `asset-charge-history.test.tsx` pins that no
   unhandled rejection reaches the process.

Note on the round-4 "reading full rows for the aggregate does not need the
lock" entry: round 5 deliberately reintroduces a full read in the write gate,
because correctness (one summation, one order) outranks the single-aggregate
micro-optimisation. The read still happens inside the same locked transaction.

## Review round 6 — PR #422 (six batched findings)

1. **A stale cached default can no longer be charged.** Round 5 made the
   default query refetch on open, but React Query still returns the previous
   open's cached value while that refetch is in flight; the prefill effect used
   it, so the operator could submit a stale amount. The effect now returns
   while `isFetching` and while `isError` (a failed refetch keeps the cached
   value in TanStack v5), and applies the default only once the fresh read
   settles. While it is blank, submitting sends `null`, which makes the server
   resolve the default at write time (always current).
   `transfer-item-dialog.test.tsx` pins the blank-while-loading field and the
   errored-refetch case; the loading test fails on the round-5 code (it
   prefilled `55000`).
2. **Money is rounded at the write boundary.** `parseAmount` (used by the
   placement path) and `updateCharge` now run every amount through the shared
   `roundMoney` helper before it is stored, and `resolveDefault` rounds the
   amount it returns, so the stored row, the revision record, the prefilled
   default and the project total all agree on a sub-cent input.
3. **An outbound unit keeps its charge editor.** A sale, gift or return clears
   the unit's location, so it drops out of the location-contents view. The
   invoice-details asset row now embeds `AssetChargeHistory`, the per-unit view
   that stays reachable for a unit with no location.
4. **A bulk purchase reads the project's charges once.** `createPlacementCharges`
   loads the project's live charges a single time and advances a running total
   as it writes each placement; `createInvoiceGroup` groups the placements per
   project and calls it once. An N-unit purchase no longer costs N scans. The
   single-placement path keeps its own one-read gate.
5. **The percentage is derived from a typed amount once the price arrives.**
   The percentage field is disabled while the price is unknown, so it could not
   be typed; a separate effect now computes it from the amount the operator
   typed when the price lands, without touching the amount. A ref keyed to the
   price keeps ordinary amount edits on the existing `handleAmountChange` path.
6. **Invoice details stops fetching the destination lists eagerly.** The
   inline consumable transfer form is replaced by the shared `TransferItemDialog`
   (which already owns the open-gated warehouse/project queries), so the page
   itself fetches nothing until a transfer dialog opens. This also makes the
   consumable transfer charge-aware-consistent with every other transfer entry
   point.

## Review round 7 — PR #422 (aggressive local review: debate + code-review + test-audit)

Hosted Greptile is unavailable, so this round ran the three local review skills
with fresh context (critic + defender; Standards + Spec; edge + coverage +
quality). Findings and decisions:

1. **Fixed: the bulk purchase gate was NOT the read's summation.** The single
   placement path built the exact projected list and summed once, but
   `createPlacementCharges` advanced a per-step running total in
   existing-first order. A batch of `[0.01, 0.49]` on a project already at
   `MAX_MONEY_DZD` passed the gate (`MAX + 0.01 + 0.49` stays at `MAX` in
   float) and then the newest-first READ summed `0.49 + 0.01 + MAX` to `2^53`
   and threw `BUSINESS_RULE` forever. The batch now resolves every amount
   first (carrying a repeated unit's just-resolved amount forward, so it still
   matches sequential placements), checks `sumLiveCharges` over the exact
   read-ordered list once, and only then writes. Pinned by two service tests
   that fail on the pre-fix code (`refuses a batch whose individually legal
   amounts would make the total unreadable`, `rolls the whole batch back when a
   later placement overflows`) and a real-sqlite savepoint test for a mid-batch
   failure.
2. **Fixed: an unhandled rejection escaped the transfer dialog.** `handleSubmit`
   awaited `mutateAsync` with no `try/catch`, so the new charge rejections
   (aggregate overflow, missing service, over-bound default) leaked as
   `unhandledRejection` and left the dialog mid-submit. Wrapped like the
   round-5 history fix; pinned by a dialog test that fails pre-fix.
3. **Fixed: money was rendered raw in the new UI.** `AssetChargeHistory` and the
   dialog's price hint printed `55000` instead of the repo's
   `toLocaleString("ar-DZ")` convention. Pinned by tests that fail pre-fix.
4. **Fixed: the amount parser accepted hex/scientific text.** `Number("0x10")`
   and `Number("1e3")` were treated as amounts. The parser now accepts only
   plain decimal text; pinned by a test that fails pre-fix.
5. **Fixed: the history toggle had no `aria-expanded`/`aria-controls` and the
   revision list had no accessible name.** Pinned by an a11y test that fails
   pre-fix.
6. **Fixed: duplicated `roundMoney`.** Moved to `@tuari/contracts` next to
   `MAX_MONEY_DZD`; the API helper re-exports it and the web dialog imports it,
   so the two copies can no longer drift. Contract coverage for the helper
   added.
7. **Fixed (test quality):** the "warn, never block" test only asserted a button
   existed (now submits and asserts the over-price payload); the project-name
   N+1 test now counts the name queries; the contracts `charges` test now
   proves the field is required; the history test now asserts the timestamp and
   that a voided row has no edit affordance; hook mocks now record the unit id
   so a wiring swap fails.
8. **Fixed (coverage):** added the header-inherited project charge, the
   invoice path's loud failure without the charge service, an explicit `null`
   transfer amount, the void revision's reason/actor, a correction landing
   exactly on the bound, the void escape hatch, the empty batch, the batch
   default carry-forward, the consumable dialog branch and the cancel paths.
9. **Fixed (E2E):** `tests/e2e/inventory-asset-charge.spec.ts` drives the real
   purchase of an ASSET onto a project, asserts the charge in the unit history
   and at the sqlite seam, and that the transfer dialog asks for a charge.

### Dismissed with evidence

- **"A header-level project destination books no charge."** The loop iterates
  `preparedEntries`, whose ASSET `projectId` is `effectiveProjectId`
  (`inventory.service.ts:384`), not the raw entry field, so an inherited header
  project IS charged. A regression test now pins it.
- **"Asset-detail read silently degrades when the charge service is absent."**
  The production composition always wires it (`dependencies.ts`), every write
  path calls `requireAssetChargeService()`, and `getAsset` deliberately stays
  optional so a warehouse-only composition can still read. Making it strict
  would break warehouse-only reads and a large set of pre-existing tests for no
  production-observable gain.
- **"A free placement poisons every later default."** The settled rule is
  "default = the last amount charged for that unit"; an explicit `0` IS that
  amount, the operator sees it prefilled, and can change it.
- **"The FK tightening is invisible on an existing DB."** `inventory_asset_charge`
  is created by this PR; no released database has the earlier CASCADE shape, so
  `CREATE TABLE IF NOT EXISTS` always creates the RESTRICT version.
- **"Void relies on unverified Drizzle behaviour."** Disproven by the real-sqlite
  void test: `updateCharge` with no `amountDzd` leaves the NOT NULL column
  intact and the suite passes.
- **Em dashes in new code comments.** The codebase uses `—` in JSDoc throughout
  (`git grep` on `origin/develop`), and `check:unslop` scopes to markdown only.

### Reported, not fixed here (pre-existing or owned by another issue)

- `movement_id … ON DELETE SET NULL` can orphan a charge's placement reference,
  and a SQLite FK violation on a future delete path is unmapped. No delete path
  exists today; a follow-up should map constraint failures to `BUSINESS_RULE`.
- `listChargesByProject` returns LIVE+VOID but `listByProject` filters to LIVE;
  #414's project view should decide whether it renders voids.
- `apps/api/vitest.config.ts` coverage include omits `modules/inventory/**`, so
  the money module is not under the repo's 100% gate. Scoped coverage over
  `asset-charge.service.ts` is 100%; the config gap is pre-existing.
- Web `transfer-item-dialog.tsx` branch coverage (~79%) is UI chrome
  (consumable quantity, cancel handlers); web has no coverage threshold gate.
