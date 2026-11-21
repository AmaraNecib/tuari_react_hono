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
