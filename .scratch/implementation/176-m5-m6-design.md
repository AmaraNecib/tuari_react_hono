# Issue 176 — M5 shell spacing and M6 routes

Base supplied for this lane: `e340e53b9cefd9fc367457d624a98d0eb9657f1b`. Worktree: `D:/worktrees/tuari_react_hono/t3-3f2b76f6-dc8365315592308a`. Verification mode: focused-local / CI-final-pending. This worktree already contains the parent integration commit `5056bfad0359aa7c5173d900759b04fd91ba11c1`; do not treat that as an independent base change.

## Findings and scope

M5 shell content used uniform `px-10 py-8`, including narrow screens. Changed it to responsive padding (`px-4 py-4`, `sm:px-6 sm:py-6`, `lg:px-10 lg:py-8`); values are symmetric and preserve RTL/LTR behavior. M6 already has `NotFoundPage` for `/roles` and the router-level `defaultNotFoundComponent`; no duplicate catch-all was added. `WorkspaceSidebar` declares a roles page type and `rolesLabel` prop, but renders no roles navigation item. No roles link removal is needed. Route tests and browser proof remain required before final integration.

## Verification boundary

No desktop/mobile RTL/LTR browser capture or mounted router regression proof was run in this lane. The source inspection establishes the existing route wiring, not runtime behavior. Parent owns final integrated UI review. CI-final acceptance remains pending.
