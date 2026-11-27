# #253 catalog persisted-state assertions

## Scope and authority

Base: `9cdef3d920975d2187111aa09be2db789ad09318`. Canonical tree: `D:/worktrees/tuari_react_hono/t3-2e888cce-5596fda057860e14`. Branch: `test/catalog-persisted-state`.

This change adds persisted-state assertions to the existing real-SQLite `CatalogService` type-change test. It does not change production behavior or the type-change policy. Committed paths are `apps/api/src/modules/inventory/item-offer-equivalence.test.ts` and this design note.

## Risk and seam

Tier: High-assurance. The reachable risk is changing the item type of a referenced definition or accepting a type change without storing its requested type and unit. The test uses the public `CatalogService` interface and repository-backed `getItemDefinition` readback. No module, interface, adapter, or seam changes; architecture: no seam moved.

## Proof and exclusions

Verification mode: focused-local / CI-final-pending. Run only the existing named type-change test, plus relevant focused lint and typecheck. The assertions distinguish unchanged state after a rejected referenced change and returned plus persisted `CONSUMABLE` / `قطعة` state after an accepted unreferenced change. No full API suite, repository build, coverage, browser, shipped production edit, policy change or publication is in scope. CI acceptance and all three initial review lenses remain parent-owned.

The Luna worker drafted the test and stopped before proof because the local generated contracts output was missing. After that terminal handoff the parent took sole ownership of verification. Pinned dependencies were provisioned offline without manifest changes. The existing installed Node 22 runtime was selected only for this lane, matching CI and the locked SQLite package's supported engines. Its native binding and the package-local contracts output were generated as execution prerequisites, not product changes or copied artifacts.

Two temporary mutation probes discriminate the new assertions. Moving the reference guard after the write fails the unchanged-record assertion. A no-op update returning the original item fails the requested type/unit assertion. Exact production bytes are restored after each probe; the restored named test passes with the other 15 cases filtered out. Focused strict typecheck also passes. Failed setup and wrapper attempts remain separately recorded in ignored evidence; a wrapper's missing native exit is not relabeled as a passing build. Direct native and local-contract import smokes verify the usable prerequisites without rebuilding them.

No module, interface or seam changed. Existing broader accepted proof is retained rather than replayed. This batch is partial #253 progress, not a coverage-percentage or #253/#255/#257 completion claim.

## Domain terms

An item definition's `itemType` is read by the inventory offer rule. An inventory entry referencing that definition makes the type part of stored inventory history. The test observes this through the public catalog read interface, not direct SQL.
