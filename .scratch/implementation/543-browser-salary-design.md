# #543 salary earnings page

## Scope and state

- Base: `7e91bf716f572eca922fb1d78999ea4ec8db76c4` in `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`.
- PR #541, salary task #543. Verification mode: focused-local / CI-final-pending.
- High-assurance: approval is a money command with durable recovery and uncertain outcomes.
- Parent owns browser inspection and broader full-application integration. This change stays inside the existing exact salary page and its direct shell test. No native app or CDP work.

## Page design

The salary route is a production page in the existing shell, not a demo entry. It uses `PageHeader`, `Surface`, `SurfaceHeader`, `Field`, `NativeSelect`, `CurrencyInput`, `MoneyValue`, and the existing table patterns. The content width is capped at `max-w-6xl`; form fields remain bounded, allocation rows collapse to one column on narrow screens, and the saved table scrolls inside its own wrapper. The page follows the existing RTL direction and light/dark tokens.

The page separates three jobs: employee monthly approval, saved earning history, and project labor-cost readback. Saved rows show exact approved and remaining amounts, A-B-A segment order, and the unallocated amount. Cash payment stays unavailable here.

## State and interface decisions

The durable approval executor owns the request identity and payload. A restored intent remains locked until the same request gets a confirmed result. Pending and uncertain states still prevent duplicate submissions and employee changes. After confirmed success, page-level recovery state no longer blocks navigation or employee selection even though the page's initial recovery snapshot is stale.

`useBlocker` now requests a resolver. A blocked navigation renders an inline alert dialog with a stay action and an explicit leave-and-recover action. The intent remains in browser storage if the operator leaves. The page also explains a pending or unreadable recovery state before the form, so a blocked route does not look frozen.

The changed module interface remains the exact workforce client supplied by `WorkspaceShell`. The client wrapper only adds React Query invalidation after approval. A focused integration test uses `createExactWorkforceClient` at the page seam and checks that the real oRPC proxy sends `listEmployeeEarnings` to its method path, without probing `name`, `valueOf`, or `toString`.

## Test seams and proof

- Recovery lifecycle seam: pre-seed the existing scoped browser store, retry, confirm the same payload, confirm storage clears, and confirm the employee selector and navigation blocker unlock.
- Uncertain outcome seam: retain the existing failure/retry coverage. The same request ID and payload remain fenced after an uncertain error.
- Navigation seam: assert resolver mode, blocked-state copy, stay/reset and leave/proceed actions.
- Real client seam: render the page with the actual exact-workforce oRPC proxy and assert the emitted method URL.
- Direct caller: `WorkspaceShell` continues to load exact employee and project IDs through the typed client.

Run the three salary Vitest files and the `WorkspaceShell` integration test, web typecheck, and ESLint on affected files. The final focused run passed 27 tests across four files. Logs are in `.scratch/reviews/543/browser-rebuild-01/worker-implementation/focused-vitest-final-03.log`, `web-typecheck-final-03.log`, and `affected-eslint-final-03.log`. Full suites, builds, browser checks, native checks, hosted review and effective protection remain outside this worker's handoff.

## Findings and boundary

The source shows that `recovery.record !== null` previously kept the page blocked after the executor had cleared storage, and the blocker had no resolver UI. The fix scopes the record guard to non-approved state and renders resolver actions.

The real oRPC proxy test confirms the declared exact method path. It does not reproduce the parent's `name/valueOf` requests or the employee select reverting in the live browser. I did not establish a runtime root cause or change unrelated client/shell code. Parent browser diagnosis and broader full-shell integration remain open.
