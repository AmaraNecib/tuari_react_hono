# Deferred movement definitions

## Scope and risk

Worktree: `D:/worktrees/tuari_react_hono/t3-b4a5f1ed-88a5c37d564fdb1b`.
Base: `6587e466cdc5913c28777362740a0270ffb8fe6d`.
Mode: focused-local / CI-final-pending. This is a high-assurance bounded correction for Greptile thread `PRRT_kwDORksw9M66QLbt`. The parent owns combined-delta review, integration and publication.

The movement form initializes its stock identity before asynchronous definitions arrive. The DOM can display the first option while React state still contains an empty identity, so Confirm stays disabled. The recovered draft had no executable proof. Its regression also used the wrong Arabic label and tried to confirm a transfer without choosing a destination.

## Decision

Keep the form interface unchanged. Memoize eligible stock and reconcile the selected identity only when it is absent from that set. Preserve a still-valid explicit choice. Clear selection when stock is exhausted or its definition becomes inactive. The effect depends on both eligible options and selection; its guarded update settles without query invalidation or repeated fetching.

The initial movement page must also wait for successful definitions and contents before mounting the form. Otherwise a stock-first arrival displays an empty-stock message while definitions are pending or failed, and the modal hides the page's existing retry control. Change only that mount condition. Keep the existing loading/error/retry rendering and all queries running.

Domain identities remain distinct: a consumable balance option identifies outbound stock; its inventory entry identifies the original producer for an internal transfer. `WAREHOUSE:same` and `PROJECT:same` are different sources. No quantity, price, debt, ledger or API semantics change.

## Proof

Use the real form, production inventory/session hooks, ORPC client and QueryClient. Mock only transport in the production-query regression file. Delay definitions and contents independently, in both arrival orders. Assert enabled confirmation, exact outbound identity, exact producer entry for an internal transfer, preservation after stock refresh, replacement after removal, exhaustion, typed location changes and bounded transport counts. Validate stock fixtures against the contract schema.

Exercise the actual initial-movement page with pending dependencies, definitions failure, contents failure, retry and successful empty contents. Keep existing forms, route and production-stock regressions in the affected check.

Negative proof removes only the reconciliation effect, reproduces disabled confirmation in both arrival orders, then restores the source bytes and checks SHA256. This is independent mutation proof, not a claim that the recovered draft was written red-first. Logs preserve the initial label failures and the corrected mock typing failure separately from passing checks.

Toolchain reuse is read-only through ignored root/web dependency links to the parent installation. Invoke the installed Vitest entry from this worktree's web cwd. An external config imports this worktree's actual config and overrides only Vite `cacheDir` to a fresh C-drive directory. No deprecated CLI cache option, tracked config edit, installation or contracts build is needed. Full suites and browsers remain CI-final; affected local checks do not claim hosted acceptance.

## Architecture and lessons

Architecture: no seam moved. The form owns reconciliation behind its existing props; deleting it would push eligibility, exact command construction and draft handling into callers. No new adapter or duplicate production selection helper is introduced. The page change only controls readiness of its existing form.

Applied lessons: dialogs retain identity rather than snapshot derived data; reset dependencies include every input used by defaults; fresh DOM queries observe refreshed state; fixtures satisfy schemas because Vitest does not typecheck; session cache uses the production `sessionQueryKey`. Mutation-terminal reset changes are excluded because this correction does not create a new draft lifecycle.

Excluded files include contracts, locale resources, CI/policy, generated output and the parallel `PurchaseMovementHistory` separator block. Execution logs and the exact-HEAD handoff stay ignored and local. No children, push, PR or merge.

## Bounded correction after review

Correction base: `60252795b0478d9faefac779bffd7c925d8e033d`. The parent review at `.scratch/reviews/579-outbound/combined-full-sol.md` found one P2, "Automatic replacement transfers an asset-specific charge override to another asset". The original reconciliation changed only `pick`, so a zero/custom charge for A could bypass B's pending or failed default. The manual choice handler already clears both charge fields.

Reconciliation now changes `pick`, `chargeOverride` and `chargeValue` together, only when the next identity differs. A still-eligible identity returns without changing its draft. Exhaustion changes A to an empty identity and clears the charge draft; newly eligible B cannot inherit it. No other draft fields are reset.

Render ordering matters. Before the effect runs on removal or inactivation, the old identity is absent from `options`, so `selected` is undefined and command construction rejects the submission. The synchronous effect batches all three setters in one React update, without an await or separate callback. The next render resolves B with override false and empty charge value. B's default query uses B's identity, has no previous-data placeholder, and Confirm remains disabled until its own default succeeds. There is no committed B render using A's override. A same-identity quantity refresh does not enter the reset branch.

Four transport-only production-hook regressions cover stock removal, inactive-definition replacement, A-to-empty-to-B and manual choice. Each first proves that A's explicit zero survives a stock quantity refresh and submits A with exactly `0.00`. After replacement, B is selected with override unchecked, its input hidden and Confirm disabled while B's default is deferred. The stock-removal case also rejects B's default, checks disabled confirmation during failure, retries and then submits B with `chargeAmountDzd: undefined`. The other cases resolve B's deferred default directly. These cases preserve the existing arrival, typed-source and money tests.

The new tests ran against unchanged production source at the correction base before implementation: three automatic replacement cases failed on stale checked override; manual selection and the six existing cases passed. The corrected regression file then passed all ten cases. The affected run adds the existing equipment file to forms, production queries, routes and stock tests because the finding concerns project-charge defaults. Full suites, browser execution and hosted acceptance remain outside worker scope. The parent owns one fresh combined-delta review carrying forward unchanged conclusions.
