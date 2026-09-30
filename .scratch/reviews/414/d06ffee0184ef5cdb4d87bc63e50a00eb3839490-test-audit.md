# #414 — test audit (edge hunter + coverage analyst + quality reviewer)

HEAD reviewed: `d06ffee0184ef5cdb4d87bc63e50a00eb3839490`
Base: `55b71181a493fcfe413b2375b1901e1a36f66513`
Tier: High-assurance. Three parallel agents (workflow `1235d31c-…`, children
`edge` / `coverage` / `quality`); full reports in the run artifacts.

## Edge hunter — HIGH-risk findings and disposition

| Risk | Finding | Decision |
| --- | --- | --- |
| HIGH | `paymentDays = 0`/negative silently multiplied the share (`… : 1`). | **Fixed** — typed `BUSINESS_RULE` error; service test for 0. |
| HIGH | `splitDays > paymentDays` trusted across the module boundary. | **Accepted + note.** The #412 write service prevents it; #427 tracks a storage CHECK. The read model cannot re-litigate a payment's split without loading all its rows; a read-model reconciliation is out of scope. |
| HIGH | Blank/whitespace `whatFor`/`sellerName`/`assetName`/`itemName`/`unit` fail `nullableTextSchema`, killing the whole response. | **Fixed** — the adapter now trims every nullable text field to `null`; adapter test inserts `'   '` for `what_for` and `full_name`. |
| MED | Strict ISO `timestampSchema` vs raw DATETIME columns. | **Accepted + note.** All writers normalise (expenses `toUtcInstant`; the rest `createAlgeriaTimestamp`); only a hand-edited/restored legacy row could differ. Left as a residual risk; other read models behave the same. |
| MED | Self-transfer / round-trip consumable movements inflate the cost. | **Accepted.** `transferConsumable` rejects a same-source-and-destination move; a crafted DB row is outside the write paths. The documented issue-as-is rule (issued = cost) is pinned. |
| MED | One over-bound legacy amount makes the whole cost unreadable and leaks the field key in the message. | **Fixed (message).** Generic Arabic message; the refusal itself is the #413 convention. |
| MED | `sumMoney` was NaN-blind (`NaN > MAX` is false). | **Fixed** — `!Number.isFinite(total)` now throws. |
| LOW | Duplicate React keys for parked consumables (no id selected). | **Fixed** — `b.id` is selected and exposed; the UI keys on it. |
| LOW | Percentages can sum to 99/101. | **Accepted** — display-only. |
| LOW | Parked-only project rendered the empty-cost copy next to a non-zero parked total. | **Accepted + test.** The copy says "no *cost*", which is true; added a parked-only test asserting both facts. |
| LOW | Test gaps (payment days, blank text, non-ISO, boundary, edit-off, actions). | **Mostly fixed** — see below. |

## Coverage analyst — acceptance map

| Acceptance criterion | Status |
| --- | --- |
| Expenses total = sum of non-voided project expenses | Covered best: service fake + real sqlite + **real expenses module** integration (assign-after-create and void). |
| Salary part = allocated days × day rate | Covered; non-whole-rate exact-division case now also documents the rounded `dayRateDzd`; `paymentDays=0` refusal added. |
| Stock part = charges for placements | Covered for the LIVE predicate + void exclusion. Placement-away lifecycle not separately tested (the #413 chain keeps the charge; the read filters LIVE). |
| Consumed part matches the inventory module's value | Formula matches by reading; **no cross-module test** → follow-up. |
| Each source in isolation, combination, no activity, unassigned-then-assigned | Covered; no-activity now also exercised at the real-adapter/service boundary, and edit-**off** added. |
| One RPC returns total + parts + rows | Now covered at the wire: the router test round-trips a **fully populated** `ProjectCost` and parses it with `projectCostSchema`. |
| Parked separate, never cost | Covered at service, adapter and UI levels. |
| Empty state says what to do | Labels asserted **and** the three actions now asserted (routes + `onOpenItems`). |

Remaining coverage follow-ups (recommended, not blockers): a cross-module
consumable pin (drive `generateMovementReport`/`listMovementValuations` and
compare), and a Playwright E2E (see code-review).

## Quality reviewer — grade B, fixes applied

Fixed:
- Loading test now asserts the positive loading copy; error test asserts the
  retry control and that clicking it calls `refetch`; the `as never` cast on the
  primed extras was removed (the helper takes `Record<string, unknown>`).
- Bound test asserts the error **code** and adds an at-bound passing case.
- Contract test: stored-row-permissive vs computed-aggregate-bounded money rule.
- Web counts made exact; parked-only and empty-state action tests added.
- Both sqlite test files now close their DB in `afterEach`.
- Ordering is now falsifiable: a service test feeds out-of-order rows.

Accepted / deferred:
- The 6-method repo fake is repeated in the service test and the router test;
  a shared `project-cost.test-helpers.ts` would remove it. Deferred (test-only
  duplication, and the router harness already stub-defaults the service).
- The pre-existing duplicate `backupService` key in `router.test.ts` (Vite
  warning) is untouched; it predates this lane.
