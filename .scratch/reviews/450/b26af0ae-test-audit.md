# #450 — test audit (3 agents: edge case, coverage, quality)

- **Reviewed code HEAD**: `b26af0ae` (supersedes the `e37e2561` review round)
- **Base**: `origin/develop` @ `073af118`
- **Method**: fresh-context edge-case hunter, coverage analyst, quality reviewer. Raw
  transcripts: `.scratch/sessions/450-review/{audit-edge,audit-coverage,audit-quality}.md`.

## Findings

| # | Finding | Severity | Verdict | Test added (all in `outbound-transfer-availability.test.ts`) |
|---|---|---|---|---|
| G1 | Picker/write-gate agreement tested only for a WAREHOUSE source; the PROJECT arm of the shared source predicate and the service's `source` construction unexercised. | HIGH | **Fixed** | `agrees with the paged picker for a project source` |
| Y2 | `quantity: 0`/negative is only guarded by the wire schema; a direct caller persists an empty transfer (no movement, but the transfer row is written). | MED | **Fixed** (code guard + test) | `refuses a non-positive quantity before writing anything`; gate now calls `normalizePositive` per line |
| G2 | No test for a request above the total across balances (`available < quantity`). | MED | **Fixed** | `rejects a request above the total across balances, and accepts exactly the total` |
| G3 | Asset movement reshaped (one per unit, `assetUnitId`); no test pins the fan-out or which units leave. | MED | **Fixed** | `moves a definition's asset units with one movement per unit and leaves other definitions alone` |
| Y4 / F7 | Partial-mutation rollback (item 1 valid, item 2 unavailable) untested. | MED | **Fixed** | `rolls back a partial transfer when a later item is unavailable` |
| Y3 | Duplicate `itemId` lines against one balance untested; the per-item re-read inside the loop is load-bearing. | MED | **Fixed** | `consumes two lines of the same definition against one balance` |
| Y1 | Exact-total consume (`left === 0 → delete`) boundary untested. | LOW | **Fixed** | folded into the over-request test (consume exactly 5 of 3+2) |
| Y5 | `NOT_FOUND` for an id that is an entry, not a definition, untested (the issue's exact confusion class). | LOW | **Fixed** | `rejects an id that is an inventory entry, not a definition` |
| Q2 | Parity test's bare `catch {}` records rejections without asserting why. | LOW | **Fixed** | the catch now asserts `InventoryError` with code `BUSINESS_RULE`; a `NOT_FOUND` from a broken lookup no longer counts as a rejection |
| G4 | No PROJECT-source outbound test anywhere. | LOW | **Fixed** | same test as G1 |
| Y6 | Fractional leftover rows / `quantity` not `.int()`. | LOW | **Dismissed** | consumable units are arbitrary (kg); asset truncation is pre-existing (`073af118` `.slice(0, qty)` + `< qty`) |
| Q3 | `c-elsewhere`/`c-empty` rejected by quantity as well as the rule, so only `c-archived` discriminates `activeOnly`. | LOW | **Dismissed** | set-equality still pins the verdict; adding a second discriminator is not worth a test that the rule module already covers |
| Q4 | Test 4 shares one env across fixtures (implicit order dependency). | LOW | **Dismissed** | fixtures never share a definition/entry; a comment would be cosmetic |
| Coverage | `item-offer-equivalence.test.ts:candidateOf` re-implements the read in raw SQL. | LOW | **Dismissed** | test-local projection, documented by #465; the gate parity test covers the production read transitively |

## Verification of the audit's open questions

- **Y7 (reports totals under per-unit movements)** — re-ran
  `src/rpc/handlers/reports.test.ts` in the targeted suite: green. The MOVEMENT report
  aggregates by movement; N movements of a split line sum to the line total. The new
  asset test pins the writer's per-unit shape directly.
- **Quality grade at `e37e2561`**: B+ (real red/green, clean isolation, two coverage
  gaps). The two gaps (project branch, swallowed rejection reason) are closed here; the
  remaining items are polish.

## Red → green

The whole suite was run against the two earlier code states with the new tests in place:

- `073af118` (original bug): **9 of 11 fail**.
- `e37e2561` (first review round): **1 of 11 fails** — `refuses a non-positive quantity
  before writing anything`, the only real code change in the review round.
- `b26af0ae`: **11/11 pass**.
