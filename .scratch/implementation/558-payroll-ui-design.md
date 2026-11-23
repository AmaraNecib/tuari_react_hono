# #558 payroll UI

Base: `81572a837a85018502ee0a7618b0d56a06d52e5e`

Tree: `D:/worktrees/tuari_react_hono/t3-25ab9198-3e9c9da7ed8fd958`

Mode: focused-local / CI-final-pending

Tier: high assurance. Payroll writes affect employee balances and may be retried after a lost response.

## Scope

Wire the four existing payroll client methods into employee finance and the salary earnings tab. Leave API composition, contracts, database, roles, opening balance review and normal-route financial activation to their owners. Keep the existing earning approval and salary history routes intact. Approval creates an earning only; the user records cash separately.

## Domain terms

- **Approved earning** is a worker's approved amount, independent of cash paid.
- **Cash payment** records cash against selected earnings. An explicit `advanceAmount` may classify extra cash as a recoverable employee advance.
- **Offset** is a separate, optional non-cash settlement between one earning and one advance.
- **Repayment** is separate cash returned against an advance.
- **Pending intent** is the exact request ID and validated payload saved before dispatch. The client keeps it frozen when the response is uncertain and retries the same request.
- **Unallocated earnings** remain earnings without project attribution. They are shown separately and never become an advance.

## Interface and design

`EmployeePayrollPanel` is the single UI module for payroll summaries, cash payment, optional advance classification, offset, repayment and payment history. It accepts an employee ID. Its query and mutation hooks use the current user-scoped workspace keys and the existing `AppClient` method inputs. The panel uses `Money` parsing and `BigInt` minor units for input checks and amount composition. Wide report totals remain exact strings and render through the aggregate money formatter.

The employee finance tab shows the panel beside approved earning history. The salary earnings tab keeps its existing global history and pagination, then lets the operator select one salaried worker for the same panel. Existing approval links and filters do not change.

The panel never makes offset mandatory. Cash can consist of wages, an advance alone, or both; the advance-only variant has `wages: []` and requires no earning. Blank wage input is zero only for this explicit cash composition; an all-zero payment is rejected. Cash wage allocations cannot exceed the server-reported remaining earning. Extra cash is entered in its own recoverable-advance field and sent as `advanceAmount`; it is not silently treated as wages. Offset and repayment use separate RPC commands. Each mutation invalidates only that employee's payroll and earnings views and relevant debt/salary data. It does not invalidate project cost.

An unreviewed-opening reminder is nonblocking. Opening values stay outside current application totals. The form shows loading and service errors instead of zeroes or fake success. A pending request is scoped by user, API workspace, action and employee. The UI retains the same request after an uncertain response, reload or identity switch; only its matching successful response clears it. An exclusive Web Lock keyed by user, workspace and employee covers pending-intent checking, creation, dispatch and matching-response clearing across all actions. A second view rechecks storage inside that lock and restores an unresolved intent instead of overwriting it. Retry uses the same lock and verifies the stored request still matches before dispatch. Storage events refresh other tabs. Hosts without Web Locks fail closed before any write rather than use a non-atomic localStorage fallback. This protects unresolved request recovery; equal amounts alone do not identify duplicate intentional payments. Action selection uses ordinary grouped buttons with `aria-pressed`, not an incomplete tab pattern.

## Proof seams

- Exact intent storage validates each contract input, isolates user/workspace/employee/action, and clears only the matching request ID.
- Query hooks key by user and employee, call the four public methods without changing payloads, and invalidate payroll, earnings and debt state without labor-cost invalidation.
- `EmployeePayrollPanel` is exercised with typed payroll fixtures at the rendered form seam for cash, explicit advance classification, offset, repayment, opening reminder and response-loss retry.
- Employee and salary route tests pin integration while preserving existing history, approval and route behavior.

## Design and ownership notes

Tuari's existing `DESIGN.md` governs Arabic RTL layout, dense tables, currency placement and keyboard controls. The configured Impeccable `reference/product.md` file is absent in this checkout; the existing app UI is the design reference, and no product setup or skill changes are in scope. `MoneyValue` supports wide aggregates only in canonical two-decimal form, while the payroll report schema also accepts integer or one-place values. The panel normalizes those strings by decimal padding only; it never converts amounts to `Number`.

## Native browser proof scope

`tests/e2e/payroll-recovery.spec.ts` exercises the real employee finance route and session in two native Chromium tabs, with explicit payroll RPC fixtures only. It checks standalone-advance payload, a held native Web Lock during an uncertain response, no replacement request from the second view, exact retry after reload, storage-event clearing, keyboard activation, RTL and narrow layout. Screenshots crop the payroll region. Native rendering exposed a 305px implicit form column inside a 276px panel at a 390px viewport. The mobile form now uses one explicit zero-minimum grid track and zero-minimum label items, rather than hiding overflow or clipping controls. This selected case addresses the concrete native-lock uncertainty left by the component fake; it does not widen to the full browser suite selected conservatively by the shared translation path, and it cannot prove finance persistence or normal-root activation. It uses an isolated run database and config, never configured developer data.

No architecture seam moved beyond adding a focused payroll panel and user-scoped query hooks. The API methods remain one client adapter. Local component fixtures do not prove that normal app startup has a payroll composition; that integration is still pending.
