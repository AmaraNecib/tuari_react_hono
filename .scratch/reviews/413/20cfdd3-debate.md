# PR #422 round 7 — debate (fresh context)

mode: remote
ticket: AmaraNecib/tuari_react_hono#413
reviewed HEAD: 25c60c71 (pre-fix)
fix commit: 20cfdd30a6b8a0eda33c3eba94442df326712d3d
base: origin/develop
review tier: High-assurance (financial calculation)

Two fresh-context reviewers read the diff: a critic hunting money loss, data
corruption, app blocking, silent misreporting and bad machine state; a defender
arguing the design. The parent synthesized and decided.

## Confirmed and fixed

1. **Bulk purchase gate was not the read's summation (blocker).** The single
   placement path built the exact projected list and summed once, but
   `createPlacementCharges` advanced `roundMoney(running + amount)` per step in
   existing-first order. A batch of `[0.01, 0.49]` on a project already at
   `MAX_MONEY_DZD` passed the gate (`MAX + 0.01 + 0.49` stays at `MAX` in
   float) while the newest-first read summed `0.49 + 0.01 + MAX` to `2^53` and
   threw `BUSINESS_RULE` forever. Reproduced with a node probe before fixing.
   Fix: resolve all amounts, check `sumLiveCharges` over the exact read-ordered
   list once, then write. Tests fail on the pre-fix code.
2. **Unhandled rejection in the transfer dialog.** `handleSubmit` awaited
   `mutateAsync` with no `try/catch`; the new charge rejections escaped as
   `unhandledRejection`. Fixed and pinned.
3. **Raw money rendering.** The history row, revision lines and the dialog
   price hint printed JS numbers instead of `toLocaleString("ar-DZ")`. Fixed and
   pinned.
4. **Parser accepted hex/scientific text.** `Number("0x10")`/`Number("1e3")`
   were treated as amounts. Fixed and pinned.
5. **a11y.** The history toggle had no `aria-expanded`/`aria-controls`; the
   revision list had no accessible name. Fixed and pinned.

## Dismissed with evidence

- **"A header-level project destination books no charge."** The loop iterates
  `preparedEntries`, whose ASSET `projectId` is `effectiveProjectId`
  (`inventory.service.ts:384`), not the raw entry field. A regression test now
  pins the header-inherited charge.
- **"Asset-detail read silently degrades without the charge service."** The
  composition root always wires it (`dependencies.ts`), every write path calls
  `requireAssetChargeService()`, and `getAsset` stays optional so a
  warehouse-only composition can read. Strictness would break warehouse reads
  and many pre-existing tests for no production-observable gain.
- **"A free placement poisons every later default."** The settled rule is
  "default = the last amount charged"; an explicit `0` is that amount and is
  prefilled visibly.
- **"The FK tightening is invisible on an existing DB."** `inventory_asset_charge`
  is created by this PR; no released DB has the earlier CASCADE shape.
- **"Void relies on unverified Drizzle behaviour."** Disproven by the real-sqlite
  void test.
- **Em dashes in code comments.** Pervasive in `origin/develop` JSDoc;
  `check:unslop` scopes to markdown only.

## Reported, not fixed

- `movement_id ON DELETE SET NULL` can orphan a charge's placement reference,
  and a future delete path's SQLite FK error is unmapped. No delete path exists
  today.
- `listChargesByProject` returns LIVE+VOID but `listByProject` filters to LIVE;
  #414 owns the project view.
- `apps/api/vitest.config.ts` omits `modules/inventory/**` from coverage.

## Defender (confidence)

Transaction nesting (SAVEPOINT join) 9/10; write/read single summation 8/10
(now 10/10 after the bulk fix); aggregate bounds 8/10; FK choices 8/10;
three-valued parser 7/10; stale-prefill guard 8/10; RPC error mapping 7/10.
Least defensible before the fix: the bulk running total vs the batch read,
which the critic confirmed as a real defect.
