# Test Audit — issue #284 repo hygiene

Head: `03ec349` (working tree diff vs base, not yet committed at audit time).

## How it ran

Three parallel reviewer sub-agents (edge-case hunter, coverage analyst, quality
reviewer) audited the changed files + new tests:

- `tests/e2e/mobile-drawer.spec.ts` (new, 3 Playwright tests)
- `tests/repo-hygiene.test.mjs` (new, 3 node tests)
- `apps/web/src/features/app-shell/home-view.test.tsx` (5 new unit tests)
- Sources: `home-view-signed-in-shell.tsx`, `workspace-sidebar.tsx`,
  `use-mobile-layout.ts`, `styles.css`

## Findings and dispositions

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| 1 | RED | "closes the mobile drawer when navigating to another page" unit test was vacuous: it unmounted + remounted the shell, so `useMobileLayout`'s local `useState(false)` reset and the test passed even if the close-on-navigation `useEffect` were deleted | **Fixed** — rewrote to an in-place `view.rerender(...)` with a changed `page` prop (same mounted shell), so the effect must fire for the assertion to pass |
| 2 | ORANGE | `window.innerWidth = 375` never restored between tests → viewport pollution for later tests in the file | **Fixed** — `afterEach` restores `innerWidth` to 1024 |
| 3 | ORANGE | Tablet-band (768–1023px) stale drawer: resize handler only closed `sidebarOpen` at ≥1024px, so a 375→800→375 round trip left `data-sidebar-open="true"` and the drawer popped open on return to mobile | **Fixed** — `use-mobile-layout.ts` now closes the drawer when leaving the mobile band (`width >= TABLET_BREAKPOINT`); added a unit test pinning the round trip |
| 4 | YELLOW | Same-page nav link doesn't close the drawer (no `page` change → effect doesn't fire) | Accepted — matches the issue's "after navigation" scope; backdrop tap still closes it |
| 5 | YELLOW | E2E `toBe(375)` bounding-box assertion is RTL-specific | Accepted — app is RTL-only today; poll-wrapped + exactly representable (quality reviewer: "no action needed") |
| 6 | YELLOW | Focus-ring node test is a string smoke test, not a computed-contrast check | Accepted — appropriate for a repo-hygiene guard; the CSS variable itself (`--ring: #d97a4a`) is full-opacity by construction |
| 7 | YELLOW | `dataTour` prop migration (tour target moved wrapper→aside) had no regression test | **Fixed** — skip-link unit test now asserts `aside[data-tour="sidebar"]` exists |
| 8 | YELLOW | Backdrop `aria-hidden` on a clickable div; no Escape/scroll-lock | Accepted — pre-existing drawer gaps beyond this issue's scope; `aria-hidden` on the decorative scrim matches the repo's `MobileSheet` pattern |

## Coverage verdict

All 5 acceptance criteria map to tests across 3 layers (node config guards,
jsdom unit, real-browser Playwright). Diversity is good; no meaningful
duplication (unit = structure/state, E2E = geometry + keyboard flow).

Grade (quality reviewer): **A-**. No blockers.
