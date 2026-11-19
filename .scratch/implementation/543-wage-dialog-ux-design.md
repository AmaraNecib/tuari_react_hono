# Earned-wage approval UX and salary navigation

## Scope and evidence

- Worktree: `D:/worktrees/tuari_react_hono/t3-d5a68276-97285353df356c66`
- Follow-up base: `d1f987d61ed8aef2b6e729bfb755006a2a6d3750`
- Verification mode: `focused-local / CI-final-enforced`. The active protection record does not establish hosted acceptance for this follow-up head. Run affected local proof only; CI remains the final acceptance gate.
- Review tier: high assurance. Approval requests freeze exact amounts and ordered project rows when a response is uncertain. Salary navigation is a bounded separate commit within the same follow-up.
- Existing unrelated dirty files: desktop Cargo manifest and two generated Tauri schemas; do not stage or modify them.

## Domain terms and boundaries

An **approval total** is the earned amount the operator enters. **Allocated amount** is the exact sum assigned to project rows. **Unallocated remainder** is approval total minus allocations. A positive remainder stays unassigned. An approved earned wage is not evidence of cash payment; this work does not add or imply settlement, paid balances, or payment history.

The existing draft finalizer and pending-storage modules remain the authorities for wire validation and frozen retry identity. The route reuses those seams rather than creating a second approval workflow. The existing shared pagination primitive remains unchanged; only the salaries route owns URL-backed table state.

## Approval-page decisions

- Replace the modal as the user-facing approval surface with `/employees/$employeeId/earnings/new`. Keep the form lifecycle, exact payload, draft, and pending retry behavior. Both the employee-detail action and the salaries entrypoints navigate to the page. A missing or ineligible employee gets an explicit unavailable state.
- Keep the approval total editable and do not infer it from `salaryReference`. Keep ordered project rows, stable row IDs, request IDs, UTC day boundaries, and immutable uncertain retries.
- Offer a daily-reference suggestion only when the reference period is `DAILY` and the entered day count is a positive safe integer. Multiply exact unit-price units by days and round once using the existing exact-money contract. Do not infer weekly or monthly divisors. Preserve non-empty manual amounts and the salary reference; suggestions remain explicit.
- Derive totals and the remainder in integer minor units. Do not clamp or hide a negative remainder. Clear a stale `positiveTotal` error when an edit makes the cross-field total valid, without clearing date, server, or other unrelated errors.
- Keep the summary compact and right-aligned under short Arabic labels. Keep DZD visible in values, not repeated in labels. Use LTR direction only inside numeric `<bdi>` elements. Keep approval and earnings names explicit. In the history, put the concise approval-versus-payment distinction in a collapsed, keyboard-accessible disclosure beside the section, not in always-visible prose above the table. Keep form clarification at the moment of approval; do not repeat it in each row.
- Let the document scroll normally. Keep dates and the total near the top, project rows in a table, and primary actions available at the bottom without an internally scrolling modal.
- Reassess the entrypoint and row layout after the owner's live feedback rather than repeat numeric fixes. Approval eligibility in all current employee and salaries entrypoints is active employee status, not the worker role. The fourth profile tab remains the existing worker-only debt view; it is not the approval entrypoint and this scope does not extend debt permissions.
- A daily suggestion is a proposed project-row amount, not a replacement for the approval total. Put its exact amount and explicit apply action on a separate full-width helper line below the controls. Keep that line visible after applying, with the apply action disabled for any nonblank amount. The project, days, amount and concise accessible delete action keep their positions; a disappearing suggestion inside one input label must not shift the row.

## Salaries URL-state decisions

- Validate `tab`, `page`, and `pageSize` in the `/salaries` route. Defaults are `recent`, page `1`, and the existing default page size. Invalid values fall back safely. Preserve unrelated search keys.
- Drive the selected tab and all three salary tables' current pagination from route search. Tab, filter, and page-size changes reset page to `1`; page changes use normal history entries so back/forward can restore prior state.
- Clamp an out-of-range page only after its table data has loaded. Do not let a transient empty/loading result rewrite the URL. Keep salary-specific pagination scoped to these tables; do not change shared pagination behavior or claim other tables are URL-backed.
- Do not alter earned-wage approval or payment semantics as part of this navigation change.

## Verification and review

- Architecture: the approval page owns route transitions while the existing form owns draft and retry state. `useSalaryRoutePagination` adapts URL-backed state without changing shared pagination behavior or domain contracts.
- Focused tests cover full-page navigation and unavailable employee states, both approval entrypoints, daily and explicit total-weighted suggestions, manual/reference preservation, cross-field error clearing, and frozen retry recovery.
- Focused salary-route tests cover for direct/reloaded search state, invalid values and unrelated keys, tab/filter/page-size resets, pagination history/back-forward, and the no-clamp loading case.
- Run affected tests, web ESLint, web typecheck, and `git diff --check`. Full suites and builds remain CI-final unless a concrete gap justifies a queued run.
- Parent owns final interactive/browser verification and the required review lenses at the integrated head. Worker does not publish, open a PR, merge, use the owner's live app, or claim hosted acceptance.
- Applied wisdom: exact money splits reconcile across all lines; reset effects key on every default input; forms open with sensible defaults. Preserve the existing shared controls and Arabic resources as design authorities; this tree has no app-level `DESIGN.md` or `PRODUCT.md`.
