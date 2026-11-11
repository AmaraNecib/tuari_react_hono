# Exact employee UI continuation

## Scope and proof target

Base: `c626775b9f1ca681e84f334552f876b7b0f85de6`, with exact employee contracts from `6abc60d3` in ancestry. Worktree: `D:/worktrees/tuari_react_hono/t3-2c00bc73-5ee739d20f3ee922`, branch `feat/exact-employee-ui`. High-assurance, focused-local / CI-final-enforced. This lane adds exact employee workflows at the existing exported employee page seams. It does not wire the application root or implement payroll.

## Domain terms and constraints

An employee's salary reference is a profile hint, not earned wages or a payment allocation. `DAILY` uses four decimal places; `WEEKLY` and `MONTHLY` use two. A missing reference is `null`, distinct from a zero reference. Exact data stays in canonical strings through editing and rendering. A profile save uses `employeesSave` so the profile and any submitted workplace or managed-scope change stay atomic. Omitted relationship fields remain omitted; they are not empty replacements. Employee state history comes only from `employeeStateHistoryList` and displays the stored reference snapshot.

Batch creation submits all rows in one `employeesBatchCreate` call. Server failures remain visible, including row-addressed errors. The UI must not salvage valid rows or claim success after a rejected or ambiguous request. Deletion calls the exact endpoint and retains the employee on refusal.

## Interfaces

Existing page callers keep their numeric props and render the current numeric implementation. Each exported page gains an explicit `mode: "exact"` branch with one supplied `ExactEmployeeClient`; profile/edit/details props use exact IDs and exact records. No numeric hook, workspace query, or implicit client construction enters that branch. Exact table options (roles and workplace/manager choices) are injected as actual typed records by the future root integration.

The exact page module owns loading, error, empty, save, and refresh states. Refresh failures are separate from successful mutations. The existing `EmployeeBatchCreatePage` export in `apps/web/src/features/employees/employee-batch-create-page.tsx` is the exact create/batch entry. Its exact mode now requires `operation: "create"` or `operation: "batch"`; the first calls `employeesCreate`, the second calls `employeesBatchCreate`. The application root remains numeric until the parent wires exact mode. No new synthetic page path or root change is part of this correction.

Edit-read failure, edit-save rejection, and post-success callback failure are separate states. A save rejection leaves the mounted form draft and relationship selections intact. Form submission and each mutation seam hold synchronous in-flight refs; they release on mutation rejection and stay locked after confirmed success. Navigation/refresh callback errors are reported as post-success errors, never as failed writes.

## Verification

Focused component tests assert independently specified canonical values and actual exact client request shapes, including large reference values, null versus zero, atomic save, history, batch row errors, server authorization refusal, and no numeric fallback. Run affected employee tests plus web typecheck and scoped lint only. Do not run a full suite or build. No browser acceptance is claimed.
