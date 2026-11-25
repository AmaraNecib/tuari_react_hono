# #637 frontend tab and inventory-cache correction

Base: `1020cbe4cd98c33640d4090faa8adf6890981d88`. Worktree: `D:/worktrees/tuari_react_hono/t3-779ed829-ff36516dd8baf44d`; branch: `fix/debt-tabs-inventory-cache`.

Verification mode supplied by parent: focused-local / CI-final-enforced. This local-only correction addresses the two frontend hosted findings; parent review and the independent source privacy/owner-contract decision remain outstanding. It does not make #637 merge-ready.

## Finding 1 — employee outer tab collision

The debt ledger now stores its inner workflow under `debtTab`; `tab=debts` remains the employee page's outer selection. The allowlist deserializer falls back to `ledger` for unknown values. The composed employee test starts with `/employees/worker-1?tab=debts`, changes the ledger workflow, confirms the outer debt tab remains selected, and remounts using the preserved outer route value. The direct debt-page test uses `debtTab=settlement`. The connected #614 case retains source navigation, account selection, Back and reload assertions and expects `debtTab=settlement`.

## Finding 2 — settlement leaves inventory balances cached

After successful confirm or reverse and pending-intent cleanup, `ManualSettlementForm.refresh()` invalidates manual-settlement history, exact-debt queries and owner-scoped exact commerce invoice/outbound list/detail query keys plus owner-scoped transfer-history queries. It does not clear unrelated query caches. Failed, refused and still-pending operations do not enter successful refresh.

Focused tests use actual `useExactInventoryInvoices` and `useExactInventoryOutbounds` hooks over fresh caches, execute recovered confirm and reverse commands through the mounted panel, verify the changed remaining balance and outbound payment visibility, and retain a separate owner's cache value. Existing panel tests cover pending/refused command behavior. The purchase/outbound detail and transfer-history invalidation branches are implemented from their inspected key factories but do not have direct settlement-flow assertions in this scope; no claim of direct proof for those branches.

## Evidence boundary

The focused employee/debt/panel tests and connected #614 browser case are the frontend proof. Typecheck and named-file lint are separate checks. Full browser suite, full web suite, production build and CI acceptance were not run. Backend source privacy/eligibility, DTOs, security regression files, authorization policy and source access are unchanged and remain independently gated. The initial implementation preceded failing-first tests; later regression tests prove the corrected behavior, but the original defect was not recorded with a dedicated red-first run.