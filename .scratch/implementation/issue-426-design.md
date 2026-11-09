# Issue 426: asset transfer browser proof

## Scope and authority

Owner-authorized independent issue owner in `D:/worktrees/tuari_react_hono/fix-v1-issue-426`, targeting develop. Base `93be734450380ddcf0e91590f0ce73e22bf5029a`, including prerequisites #507 and #508. Live issue #426 asks for project transfer defaults, persisted history and project total, warehouse transfer without a charge, and correction history with reason.

Verification mode: focused-local / CI-final-enforced. Live effective develop ruleset 26837184 was inspected on 2026-11-09. Active, no bypass actors, strict CI acceptance from app 15368, thread resolution, deletion and force-push protection. Historical pending activation prose does not replace live settings. Recheck before merge.

High-assurance review tier because tests protect reachable stock and money behavior. Three distinct local sessions in order: debate, test-audit, code-review. Same-family separate-session review uses the standing owner approval if no enabled non-author route exists. Current-head Greptile 5/5 and CI acceptance remain separate merge gates.

## Design

Keep the existing purchase path. Add three scenarios with per-attempt unique, foreign-key-checked SQLite fixtures. Seed only starting inventory, then transfer and correct through the real browser and API. Assert exact asset location and charge rows independently of rendered text. Assert project cost source and item amount through the cost tab. A warehouse transfer switches through project first to catch stale charge state. Correction targets a past placement after moving the unit away, verifies from/to and reason, reloads to prove durability, and checks the original project's corrected total.

Vocabulary is unchanged: purchase price belongs to the asset unit; a charge belongs to a project placement; correction preserves that placement and adds a revision. Warehouse custody is not a charge. No new financial decisions or glossary terms.

Architecture: no seam moved. The test-only fixture helper hides schema and repeated navigation behind named operations. Deleting it would duplicate setup and assertions in three scenarios. No production module, adapter, interface or UI changes. Screenshot comparison and UI redesign acceptance do not apply to this test-only scope.

## Verification

Select only `inventory-asset-charge.spec.ts` locally. Existing serial purchase scenarios remain covered. Use dedicated free ports and one Playwright worker to avoid sibling servers. Run through heavy_run. Install only frozen lockfile dependencies. Run relevant static checks and diff checks. Full checks remain CI-final.

Applied lessons: unique seeds per attempt; verify server ownership and isolated ports; assert mutation completion via dialog closure and persisted data rather than racing toasts; use web-first assertions without sleeps. Excluded historical full-local-suite advice because the current engineering workflow explicitly replaces it with affected local proof.

Expected failure detection comes from named UI assertions and independent database placement expectations. This is coverage of existing behavior, not a product bug fix requiring a fabricated failing baseline.
