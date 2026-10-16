# #450 — code review (Standards + Spec, two axes)

- **Reviewed code HEAD**: `b26af0ae` (supersedes the `e37e2561` review round)
- **Base**: `origin/develop` @ `073af118`
- **Method**: two fresh-context sub-agents, one per axis. Raw transcripts:
  `.scratch/sessions/450-review/{review-standards,review-spec}.md` (gitignored).

## Standards

Standards sources read: `AGENTS.md`, `docs/engineering-workflow.md`, `CODE_REVIEW.md`,
`DESIGN.md`, `CONTEXT.md`, `REVIEW_WORKFLOW.md`, plus the Fowler smell baseline.

### Documented-standard violations

| # | Finding | Verdict |
|---|---|---|
| S1 | `docs/engineering-workflow.md` §2 design-doc contents: `450-design.md` omitted mode (local-only), dependencies, deviations from architecture, and the Playwright N/A statement. | **Fixed** — added in `b26af0ae`. |
| S2 | Coverage policy (apps/api, 100% branches): the PROJECT-source arms of the new read and service had no coverage. | **Fixed** — project-source parity test added; `pnpm --filter @tuari/api exec vitest run src/modules/inventory` now exercises both source kinds. |

### Baseline smells (judgement calls)

| # | Smell | Verdict |
|---|---|---|
| S3 | Feature Envy / Data Clumps — the gate rebuilt `ItemOfferCandidate` inline (12 lines of row-shape knowledge in the service). | **Fixed** — extracted to the named module-level `itemOfferCandidate(definition, holding)`. |
| S4 | Duplicated Code — the note literal `تحويل خارجي إلى ${counterpartyId}` existed twice; `fromWarehouseId/fromProjectId` ternaries repeated. | **Fixed** — one `note` and `outboundFromLocation(source)` derived once, spread into both paths. |
| S5 | Repeated Switches / Primitive Obsession — `fromType`/`fromId` re-switched after `source` was built. | **Fixed** — `source` is the only discriminator; `outboundFromLocation` consumes it. |
| S6 | Mysterious Name — `stockAtSourceWhere` returns `{ balance, assetUnit }` predicates read as `atSource.balance`. | **Dismissed** — "Where" is the file-wide WHERE-condition convention; call sites read `atSource.balance`. Judgement call. |
| S7 | Unbounded `listItemStockAtSource` vs "No Pagination in List Endpoints". | **Dismissed** — bounded by one definition's stock at one source; not a list endpoint. |
| S8 | `mapAssetUnit(row.unit as Record<string, unknown>)` cast. | **Fixed** — cast removed; `pnpm typecheck` exit 0 confirms it matches sibling call sites (`mapMovement(row.movement)`). |

No `any` added; `/** name. */` JSDoc and AGENTS.md staging discipline respected.

## Spec

Spec source: issue #450 body + comment, `.scratch/implementation/450-design.md`.

### Implemented (with evidence)

- **Id confusion** — `createOutboundTransfer` resolves the definition and passes the
  balance row's real `inventoryEntryId` to movement/consumable writes; the collision case
  is pinned (`outbound-transfer-availability.test.ts`, `def-a` == entry `def-a`).
- **Unfiltered asset listing** — `listItemStockAtSource` joins
  `inventory_asset_unit → inventory_entry` and filters by definition + source; pinned.
- **One shared rule** — the gate calls
  `matchesItemOfferFilter(resolveItemOffer(outboundPickUsage(source)), itemOfferCandidate(...))`,
  the same functions the picker compiles from; `stockAtSourceWhere` is shared by the
  picker EXISTS and the read.
- **Picker/write-gate same set** — parity tests for WAREHOUSE **and** PROJECT sources.
- **Task (3)** — `transferConsumable`/`transferAsset` take an entry/asset id and never
  resolve a definition; no shared helper carries the bug. Now cited in the design doc.

### Notes (dispositioned)

| # | Finding | Verdict |
|---|---|---|
| P1 | "ONE shared read" is satisfied as one shared *predicate* over two reads (paged SQL EXISTS vs row read), not literally one read. | **Dismissed** — the paged picker cannot call a per-row read without N+1; the shared predicate + shared `resolveItemOffer` is the achievable form, and `item-offer-equivalence.test.ts` pins SQL == JS. |
| P2 | PROJECT-source parity unproven. | **Fixed** — project parity test added. |
| P3 | Asset movement shape changed beyond the literal ask (one per unit). | **Accepted, documented** — justified in `450-design.md`; aggregate quantity/valuation preserved; pinned by a test. |
| P4 | Cross-type mis-typed rows: offered set ⊃ accepted set. | **Dismissed** — unreachable via the service (`createInvoiceGroup` enforces the kind rule at `inventory.service.ts:429,453`); the #465 both-tables rule is deliberate. |

## Summary

Standards: 5 fixed, 3 dismissed judgement calls, 0 open.
Spec: all requirements implemented; 1 note fixed, 3 notes dismissed/documented; 0 blockers.
