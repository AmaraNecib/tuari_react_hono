# #413 stock charge - PR #422 round-5 test audit

- reviewed HEAD: `43be9c0b677c3bac7da11654368cddb9c896b194`
- delta `caefda97..43be9c0b`
- tier: High-assurance (financial calculation)

Fresh-context `reviewer` test-audit: read the changed tests in full, ran the
touched suites, and reproduced the finding-#1 divergence numerically.

```
node -e (float check)
  js newest-first [0.49,0.01,MAX] = 9007199254740992 > MAX? true   <- read throws
  sql oldest-first [MAX,0.01,0.49] = 9007199254740991 > MAX? false <- old gate accepted
apps/api vitest (6 touched files, --maxWorkers=2) -> 152 pass
apps/web vitest (asset-charge-history, inventory-hooks) -> 16 pass
```

## Verdict

No blockers. Of the new/changed assertions, the correctness ones are
discriminating; the follow-up gaps below are hardening, not defects.

## Discriminating tests

| Test | Pins | Discriminating? |
| --- | --- | --- |
| `asset-charge.service.test.ts` "ONE summation (MAX, 0.01, 0.49)" | After any accepted write the read succeeds; the 0.49 write is refused | Yes — verified numerically; the `not.toThrow` + exact `accepted` array both fail pre-fix |
| `sqlite-asset-charge.repository.test.ts` unit-delete refusal | RESTRICT enforced with `foreign_keys=ON`; charge readable | Yes (pre-fix CASCADE deleted silently) |
| `sqlite-asset-charge.repository.test.ts` invoice-cascade refusal | invoice→entry→unit cascade stopped by the charge FK | Yes |
| `sqlite-asset-charge.repository.test.ts` batched revisions | per-charge oldest-first, absent-charge/no-ids empty map | Yes (method did not exist pre-fix) |
| `inventory-transfer-charge.test.ts` missing charge service | loud refusal + real empty rollback (movement pushed before the throw) | Yes |
| `router.test.ts` charge-query mapping ×3 | NOT_FOUND / VALIDATION reach the wire as `{success:false,error}` | Yes (pre-fix the promise rejects) |
| `inventory-hooks.test.tsx` revalidate on reopen | refetch on disabled→enabled inside a 30s window | Yes; `makeQueryClient` was raised to `staleTime: 30_000` so the test cannot pass vacuously |
| `asset-charge-history.test.tsx` rejection tests ×2 | no `process` `unhandledRejection`; draft stays open | Yes on the listener assertion (manually re-verified by reverting the fix: both fail). The DOM assertions alone are non-discriminating. |
| `schema-definitions.test.ts` RESTRICT | DDL has RESTRICT and no CASCADE | Yes |

## Gaps (hardening only)

1. The MAX/0.01/0.49 pin runs on the in-memory double only; the sqlite adapter
   uses the same service-level `sumLiveCharges`, so it is covered by
   construction but no adapter-level case exists.
2. The correction projection (`replaceChargeId` in-place) has no dedicated test;
   it is correct by construction (UPDATE keeps rowid / `Map.set` keeps position).
3. The N+1 fix is pinned structurally, not empirically: no call-count/spy
   assertion proves `listRevisionsByChargeIds` replaced N queries. The
   in-memory "batched" test passes on the pre-fix `toDetail` loop too.
4. The invoice-placement missing-service path (`inventory.service.ts:538`) has
   no equivalent refusal test; it is only implied by the `reports.test.ts`
   rewiring.
5. `refetchOnMount: "always"` and the dialog's never-clobber (`amountTouched`)
   rule are untested in this delta.
6. No router-level `BUSINESS_RULE` (legacy over-bound total) case; the three
   reachable classes named by the brief are pinned.
7. `listByUnit` is intentionally unmapped; the decision is unpinned in either
   direction (a contract-widening PR would need to revisit it).

## Commands

| Command | Result |
| --- | --- |
| `node -e` float divergence | pre-fix gate accepts, read throws (see above) |
| `vitest run` 6 touched API files `--maxWorkers=2` | 6 files / 152 tests pass |
| `vitest run` 2 touched web files `--maxWorkers=2` | 2 files / 16 tests pass |
