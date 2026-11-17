# Deliver issue #543 without later payroll slices

## Authority and revisions

The owner requested a dedicated PR containing only issue #543 and the original production pages. PR #541 must remain open, unchanged and unmerged. Worktree: `D:/worktrees/tuari_react_hono/543-only-01`, branch `fix/543-only`. Base: fresh `origin/develop`, `0fdaff8fe76771c12a32bbe7bdd93f6c6935656f`. Reusable source is pinned to #541 head `ec783452375bcf2c54523b830236eebb9e046738`.

Verification mode is `focused-local / CI-final-pending`. The tier is high-assurance because employee authorization, exact earning amounts, atomic payable records and durable recovery are reachable. Historical #541 green checks and 5/5 do not verify this extraction. The owner still prohibits merge and auto-merge.

## Scope contract

Issue #543 requires authenticated employee CRUD and salary references/history; explicit period earnings with ordered repeated project segments and unallocated amounts; one authoritative earning/payable ledger transaction; normal startup with one configured database, shared FIFO and finance instance; and persistence after reopen. The A/B/A example must produce 62,500 DZD, project A 25,000 and project B 37,500 without inferring earnings from salary references or cash.

Cash payments, advances, opening reviews, repayments and earning corrections belong to later slices. Their new services, repositories, routes, public contracts, DDL, test-only composition and tracking notes must not ship accidentally. Existing baseline features are preserved; removing later additions is not permission to delete baseline behavior or weaken numeric-path refusal. Include only shared exact-money and runtime prerequisites needed by this issue. Do not add dependencies or change CI thresholds/policy.

## Original-page requirement

Inspect the original components on develop before adapting the extracted source. Reuse the actual employee table, single/batch create forms, employee detail/history, edit form and existing project/warehouse/dashboard compositions. Do not substitute miniature exact-only pages or copy their appearance. Use display records and small exact adapters at the original interfaces; money remains canonical strings and never crosses a numeric fallback. Unsupported financial operations stay refused. Their pages must preserve original layout and supported nonfinancial content rather than become an unrelated redesign.

The current #541 exact edit form is already mechanically shared with the original. Its exact table, detail and create branches still need inspection against the originals. This extraction must fix those remaining reductions instead of merely cherry-picking them. Salary approval is new #543 behavior, so compose it from the existing production page/form primitives and preserve the explicit allocation controls.

## Extraction and proof

Start from develop and import only required named paths from the pinned source. Remove later-slice sections from shared files and keep the absent-feature contract explicit. Record retained prerequisites and exclusions in the final PR. Keep one writer in this tree and use codemode for batched inspection and commands. Existing dependencies may be linked, never installed without vetting.

Run affected contract/API/UI tests and real authenticated browser cases, with exact integer expectations, duplicate-submit and invalid-input refusals, capability guards and reopen proof. Use relevant lint/typecheck and the existing E2E selector. Full checks are CI-final unless a concrete coverage gap justifies a local run. All heavy work uses the queue. Initial debate, test-audit and code-review sessions read the committed source-owning tree; bounded fixes get combined review. Review reports/logs remain ignored, and the design note is committed with complete source.

The owner clarified that the parent is the manager. From that instruction onward, subagents own implementation and heavy verification. The parent limits itself to scope, delegation, small inspections, integration, reviews and publication. Current integration combines backend worker commits `00db1855` and `a39105cf`, frontend worker commits `8160f6ee` and `4f909e05`, and the parent's earlier startup/E2E prerequisites. Remaining browser, build and heavy checks must be delegated, not run by the parent. The owner also requested an audit of line growth and direct SQL versus Drizzle; report concrete reasons and removable duplication without assuming an ORM rewrite is authorized.

Native owner data and its saved request must remain untouched. This new narrower tree is not yet the tree to launch for acceptance. PR #541 and the previous launch instructions stay tied to their pinned reviewed revision until the replacement is verified.
