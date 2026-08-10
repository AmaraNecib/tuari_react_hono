# Issue #284 — Repo hygiene (nul file, tsconfig, skip-nav, focus ring, mobile drawer)

**Tier:** Standard (config + UI + one behavior fix, no authz/security).
**Base:** `origin/develop` @ `03ec349` (HEAD is even with develop).

## Scope (5 items from the issue)

### 1. Stray `nul` file at repo root
- A 104-byte untracked `nul` file sits in the **main** checkout (`dir > nul` redirect artifact).
- Fix: delete it (untracked → filesystem-only), add `/nul` to `.gitignore`.
- Guard: a `check:repo-hygiene` node test asserts the gitignore rule exists and the file is absent.

### 2. Stale tsconfig include
- `apps/api/tsconfig.json` includes `"prisma.config.ts"` — file was removed long ago (#59).
- Fix: drop the entry.

### 3. Skip-to-content dead code
- `components/ui/skip-navigation.tsx` (`SkipNavigation` + `MainContent`) has 0 consumers.
- Fix: mount `<SkipNavigation />` as the first focusable element in `home-view-signed-in-shell.tsx`
  (outside the `.tauri-shell` grid so it cannot become a grid item), and wrap the page content
  in `<MainContent>` so the `#main-content` target exists (`<main id="main-content" tabIndex={-1}>`).
  This also makes the existing `.tauri-shell > aside + div > main` CSS (4K centering, print,
  landscape header) match as designed.

### 4. Focus ring weakened by 50%-alpha
- `styles.css:219` `* { @apply border-border outline-ring/50; ... }` → full-opacity `outline-ring`.
- The universal default outline-color at 50% ≈ 2.2:1 on white, below WCAG 2.2 Focus Appearance (3:1).
  Component-level `ring-ring/50` box-shadows pair with a full-opacity `border-ring` change and stay out of scope.

### 5. Mobile sidebar backdrop/dismiss (root cause deeper than the issue states)
- **Verified empirically (375px viewport):** the `<div data-tour="sidebar">` wrapper around
  `<WorkspaceSidebar/>` breaks every `.tauri-shell > aside` selector:
  - the drawer never becomes an overlay (aside stays `static`, a 52.5px collapsed sliver);
  - `.tauri-shell::after` backdrop DOES match (it's on the shell itself) → on mobile the open
    drawer shows a z-39 fixed backdrop with `pointer-events: auto` and **no click handler**,
    covering the header toggle → **the user is trapped**.
- Fix:
  1. Remove the wrapper div → `<aside>` becomes a direct child of `.tauri-shell`, restoring the
     mobile drawer overlay, `> aside + div` main-area grid, print and 4K rules. Keep the tour's
     declared `[data-tour="sidebar"]` target alive by passing an optional `dataTour` prop through
     `WorkspaceSidebar` onto the `<aside>` (UserJourneyTour never queries targets today, but the
     legacy `guided-tour.tsx` contract expects the attribute).
  2. Replace the `::after` pseudo-element backdrop with a real `.sb-mobile-backdrop` div rendered
     when `isMobile`, toggled via `data-open`, with `onClick={closeSidebar}` + `aria-hidden`.
  3. Close the drawer after navigation: `useEffect(() => closeSidebar(), [page])` in the shell
     (covers sidebar links, breadcrumbs, search — every route change).
  4. Remove the dead `.tauri-shell::after` rules; keep print styles updated to hide
     `.sb-mobile-backdrop`.
- Test-audit additions: mobile band is single-column regardless of `data-collapsed`
  (`.tauri-shell[data-collapsed="true"]` was beating the mobile `1fr` rule by specificity);
  backdrop is rendered AFTER the main area so `.tauri-shell > aside + div` still matches the
  content div; `use-mobile-layout` closes the drawer when leaving the mobile band (tablet round
  trip).

## Planned tests
- **Unit (vitest, `apps/web`):**
  - Shell renders skip link (role link, name "تخطي إلى المحتوى", href `#main-content`) and
    `main#main-content` exists with `tabIndex={-1}`.
  - Mobile drawer: `innerWidth` 375 → open via header toggle → `data-sidebar-open="true"`,
    backdrop visible → click backdrop → drawer closes; page prop change closes drawer.
- **E2E (Playwright, `tests/e2e/mobile-drawer.spec.ts`, mobile viewport):**
  - Sign in (reuse `bootstrapOrSignIn`), open drawer, assert aside is an overlay,
    backdrop tap closes it, nav link closes it and navigates.
- **Node (`tests/repo-hygiene.test.mjs` + `check:repo-hygiene` script):** gitignore `/nul` rule,
  no `nul` file at root, tsconfig has no `prisma.config.ts` include, styles.css `*` rule uses
  full-opacity `outline-ring`.

## Risks
- Removing the wrapper div changes DOM that the (unused) tour targets reference — verified the
  active `UserJourneyTour` never queries targets (no `querySelector`); the attribute is kept via
  the `dataTour` prop so the legacy contract survives.
- Introducing `<main>` activates previously-dead `> main` CSS (4K centering, print) — intended.
- E2E runs on the shared Playwright config: my manually-started dev servers must be killed first
  (`reuseExistingServer: false`), per testing wisdom.
