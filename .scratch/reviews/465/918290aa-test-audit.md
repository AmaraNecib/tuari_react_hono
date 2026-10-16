# Test audit — outbound item picker availability (#465)

Reviewed commit `918290aa` (base `551948e4`). All mutation runs used
`VITEST_MAX_WORKERS=2` in this worktree; the production file was restored and
rebuilt after each.

## 1. Is the equivalence test load-bearing for the new field?

Yes, on both sides, and for the right reason.

| Mutation | Suite | Result |
| --- | --- | --- |
| SQL: drop `conditions.push(sql\`(${exists(consumableStock)} OR ${exists(assetStock)})\`)` | `@tuari/api item-offer-equivalence` | **3 failed / 13 passed** (sweep + explicit trap + cursor-source reset) |
| JS: drop `(!filter.inStockAt \|\| isInStockAt(definition, filter.inStockAt))`, rebuild contracts | `@tuari/api item-offer-equivalence` | **1 failed / 15 passed** (the `p-active` JS-accept/SQL-reject mismatch) |
| Same JS mutation | `@tuari/contracts inventory-item-usage` | **failed** (`rejects an active definition with no stock at the source`, `rejects stock recorded at a different location`) |

The JS-side failure is in the contracts suite and the API sweep, not an
unrelated test. The candidate mirror was also upgraded in `918290aa` to project
the JS candidate from the seeded balance/asset rows instead of the fixture
literal, so the sweep now compares SQL against a read of the same evidence.

## 2. Does a test prove two OUTBOUND sources do not share a cache entry?

It did not before this lane; it does now.

- Before: `inventory-hooks.test.tsx` had no `OUTBOUND_PICK` at all, and the page
  test mocks `./inventory-hooks` away, so `itemUsageKey` was never exercised for
  the new surface. A source-collapsing key would have passed every test.
- Added: "keys two outbound sources separately instead of sharing the first
  source's page chain".
- Proof: setting the `OUTBOUND_PICK` branch of `itemUsageKey` to return
  `"OUTBOUND_PICK"` (source dropped) makes the new test fail
  (`1 failed / 8 passed`) because the second source is served the first source's
  cached page and no second request fires.

## 3. Is the availability trap a real fixture?

Yes. `p-active` is an active CONSUMABLE with a real
`inventory_consumable_balance` row at `prj-1` and none at `wh-1`, so
`wh-1 → {c-active, a-active}` proves the wrong source is excluded by
availability, not by absence. `c-archived` is archived **and** stocked at
`wh-1`, so it proves availability does not rescue an archived definition. The
`prj-1` direction is covered too (`c-active`/`a-active` are stocked elsewhere).

## 4. Shallow assertions in the changed tests

| # | Sev | Finding | Verdict |
| --- | --- | --- | --- |
| T1 | Low | The page test's hook mock restates the availability rule, so it cannot catch a server-side regression. | Accepted; the API equivalence suite is the real guard. |
| T2 | Low | The submit mapping was untested after the diff deleted the old catalog-membership check. | Fixed: submit payload test added. |
| T3 | Low | A zero/negative balance cannot be seeded to prove the SQL `quantity > 0` clause. | Not a gap: the column has `CHECK ("quantity" > 0)`, so the state is unrepresentable. |
| T4 | — | The mutual-consistency sweep could pass vacuously if both evaluators ignored `inStockAt`. | Covered: the explicit expected-set test supplies the absolute expectations. |

## Behaviour tests added and proven to fail pre-fix

- "clears a row's picked item when the source changes": reverting
  `outbound-transfer-create-page.tsx` + `item-list-editor.tsx` to `dfdaad48`
  makes it fail (`1 failed / 6 passed`; the picker still reads `cement`).
- "keys two outbound sources separately": fails when the source is dropped from
  the key (see §2).
- The equivalence test's load-bearing property is proven by the two mutations in
  §1.
