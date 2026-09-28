# #413 stock charge - PR #422 round-5 code review

- mode: remote
- base ref: `develop`; reviewed delta `caefda97..43be9c0b` (round-5 fix)
- reviewed HEAD: `43be9c0b677c3bac7da11654368cddb9c896b194`
- tier: High-assurance (financial calculation)

Fresh-context `reviewer` subagent, two axes. It read every changed file in
full and ran:

```
git diff --stat caefda97..43be9c0b   -> 20 files, +533/-96
vitest run src/modules/inventory/{asset-charge.service,adapters/sqlite-asset-charge.repository,inventory-transfer-charge}.test.ts \
  src/infrastructure/database/schema-definitions.test.ts src/rpc/router.test.ts src/rpc/handlers/reports.test.ts  -> 6 files / 152 pass
vitest run src/features/inventory/{asset-charge-history,inventory-hooks}.test.tsx  -> 2 files / 16 pass
```

## Verdict

APPROVE, no blockers. All seven round-5 findings are closed as scoped. The #1
invariant (write gate total == read total) holds structurally for both adapters;
the MAX/0.01/0.49 arithmetic was verified by hand.

## Per-finding confirmation

| # | Finding | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | One summation for gate + read | CONFIRMED | `listByProject` and `assertProjectTotalWithinBound` both call the one `sumLiveCharges(amounts)` over `listChargesByProject` filtered LIVE (newest-first). Placement prepends the new amount (max rowid ⇒ index 0); correction swaps in place (UPDATE keeps rowid; in-memory `Map.set` keeps position). `sumLiveChargesByProject` is deleted from the port and both adapters, so no divergent accumulator can compile. Pre-fix `MAX+0.01→MAX` (accepted) then read `0.49+0.01+MAX→2^53>MAX` (throws); the new test fails on the old code. |
| 2 | Missing charge dependency fails loudly | CONFIRMED | `inventory.service.ts:538` (invoice placement) and `:638` (transfer) call `requireAssetChargeService()` instead of `&& this.assetChargeService`; refusal happens inside the transaction so the movement rolls back. New transfer test `withoutChargeService` asserts the throw and `movements == 0`. |
| 3 | Charge query errors map to the envelope | CONFIRMED | `queryAuth` optional resolver mirrors `mutationAudit` (await in `try`, `settleResolvedError`, auth/ratelimit still outside the try). `inventoryAssetChargeDefault` and `inventoryAssetChargesListByProject` pass `toInventoryFailureResult`; their outputs are `createEntityResultSchema` (failure branch exists). Three router-level tests pin NOT_FOUND ×2 + VALIDATION at the wire. |
| 4 | Charge survives its asset / its invoice | CONFIRMED | DDL `RESTRICT` and Drizzle `onDelete: "restrict"` moved together; `schema-definitions.test.ts` asserts RESTRICT *and* the absence of CASCADE. Real-sqlite tests pin the unit delete and the invoice→entry→unit cascade delete as refused, charge readable. A repo-wide grep found no user-facing asset/invoice delete path, so no flow regresses. |
| 5 | Charge default revalidates on reopen | CONFIRMED | `staleTime: 0` + `refetchOnMount: "always"` on `useAssetChargeDefaultQuery`; dialog enables the query only while open. Test uses a 30s `staleTime` client and asserts a second fetch + the new value. The `amountTouched` never-clobber rule is untouched. |
| 6 | N+1 in the charge history removed | CONFIRMED | `listRevisionsByChargeIds` batches revisions in one query (both adapters, rowid/insertion oldest-first, empty-map on no ids); `listChargesByUnit` memoises each distinct project name per call. `toDetail` remains for the single-charge update/void results. |
| 7 | Failed correction/void no longer leaks a rejection | CONFIRMED | `saveEdit` / `confirmVoid` await `mutateAsync` in try/catch and return on failure (the `expense-form-dialog.tsx` pattern); the draft stays on screen. |

## Findings (non-blocking)

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| R1 | 2 | The write gate re-reads the full project list + resolves its name once per placed asset, reverting the round-4 single-aggregate optimisation. | Accepted: the brief requires one summation/one order, and a single SQL aggregate cannot be pinned to the read's float order. Recorded in the design doc. |
| R2 | 2 | The FK change is inert on a database that already created `inventory_asset_charge` (DDL is `CREATE TABLE IF NOT EXISTS`; no migration added). | Not reachable for users: the table is new in this unmerged PR, so no released DB has it. Flagged to the parent. |
| R3 | 2 | `inventoryAssetsGet` (and other pre-existing entity-result reads) still call bare `queryAuth`, so a `getAsset` NOT_FOUND still escapes unmapped — the same class, but outside the charge procedures the brief named. | Out of delta scope; noted as a follow-up. |
| R4 | 1 | `getAsset` still degrades to `charges: []` when the dependency is absent (`?.` read path). | Read-only path; cannot create an uncharged placement. Noted for symmetry. |
| R5 | 1 | The #1 invariant depends on an ordering contract stated in comments (both adapters do satisfy it; the sqlite project-list order is pinned by a test). | Noted; a future adapter ordering change would need the same summation. |

## Residual risks

- `listByUnit` is deliberately left unmapped: its contract output
  (`createListSchema`) has no failure branch, so mapping there would fail output
  validation. Its only reachable error is the missing service, a wiring fault.
- The write gate's correctness is by construction (same method, same order,
  same rounding); there is no query-count test on that path.
