# Debate — issue #242 (real report aggregation)

- Branch `feature/issue-242-real-reports`, base `6be3497`, evidence HEAD `e7b3fe1` (mode: local-only)
- Tier: High-assurance → critic + defender in parallel, then synthesized.

## Critic (findings, severity 1-10)

1. **S6 — inventory byLocation groups warehouse/project by a single id namespace** → warehouse and
   project sharing an id string could merge. **Fixed** in `57503b8`: grouping key is now
   location-kind-qualified (`locationType` added to the valuation row).
2. **S5 — debt direction ignored** (`totalOutstanding`/`overdue`/aging sum gross OPEN balances
   across PAYABLE + RECEIVABLE). **Documented** (JSDoc + design) as gross-exposure semantics; the
   contract's non-negative schema cannot represent a net figure; a dedicated receivable test pins
   the behavior.
3. **S4 — endDate is a participation filter, not an as-of balance snapshot.** **Documented**:
   balances are current-as-of-now; as-of-historic reconstruction is explicitly deferred.
4. **S4 — totalSettled excludes partial settlements on still-OPEN accounts.** Documented (Σ LIVE
   SETTLEMENT entries of SETTLED accounts). Kept.
5. **S4 — byItemType groups by non-unique itemName.** Inherent to the contract shape (no item id).
   Documented.
6. **S3 — lastTransaction grouped via lexicographic ISO compare** → **fixed** to `Date.parse` in
   `57503b8`.
7. **S3 — totalValueDzd summed already-rounded parts** → **fixed** to round the raw total in
   `57503b8`.
8. **S2/S2 — aging `count` = line items (documented); no NaN guard (timestamps from DB).** Accepted.

**Greptile P1 (added after debate):** debt aging 60-day boundary inconsistency — exactly-60-day
accounts fell in `31-60_DAYS` while `overdueDzd` counted them, so aging disagreed with overdue.
**Fixed** in `e7b3fe1` (age 60 → `60+_DAYS`, which by construction equals overdue) and pinned with a
boundary test.

## Defender (highlights)

Seam choice, documented age/overdue/participation semantics, honest valuation (asset outbound-sale
value 0), `roundMoney` float-noise suppression, contracts untouched, no scope creep, meaningful
end-to-end tests, full-schema in-memory DB for the OUTBOUND_SALE migration. Overall 8.7/10.

## Synthesis / decisions

| Finding | Decision |
|---|---|
| S6 id-namespace collision | **Fixed** (`57503b8`) |
| S5 debt direction | **Documented** (gross exposure across directions) + pinnable test |
| S4 endDate as-of | **Documented** (current balances; as-of deferred) |
| S4 partial settlements | Kept, documented |
| S4 byItemType name grouping | Inherent to contract; documented |
| S3 lexicographic compare | **Fixed** (`57503b8`) |
| S3 totalValue rounding | **Fixed** (`57503b8`) |
| Greptile P1 aging boundary | **Fixed** (`e7b3fe1`) + boundary test |

All blockers/majors resolved; remaining items are documented deferrals (as-of historic balances,
per-unit asset valuation on movement value, movement value for asset outbound sales, dashboard
quick-action buttons — all out of #242 scope).
