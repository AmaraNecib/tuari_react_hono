# Issue #275 — A11y: focus trap + dialog semantics on the four live custom modals

**Tier:** Standard (UI/a11y code changes, no authz/crypto/financial logic)
**Base:** `origin/develop` @ `03ec349643901a2802338d8e19b730b28e5eb841` (merge-base = HEAD)

## Problem recap

Four LIVE custom modals bypass the accessible Base UI primitive layer
(`@base-ui/react/dialog` — focus trap, ESC, scroll lock, `role="dialog"`), and a
fifth is dead code to delete:

1. **SearchDialog (Ctrl+K)** — no role/aria-modal, unlabelled search input
   (placeholder only), icon-only X/back buttons unnamed, Tab hijacked for
   result navigation (Shift+Tab cannot leave), active item visual-only.
2. **Keyboard-shortcuts help ("?")** — no role/aria-modal, no focus trap,
   no ESC-to-close.
3. **First-run tour** — `role="dialog"` + `aria-labelledby` + autofocus, but
   no focus trap and no ESC.
4. **Mobile filters drawer** — has role/aria-modal + ESC; at the issue's
   reference commit it lacked a focus trap (the current base already carries a
   hand-rolled `useFocusTrap` — see "stale claim" below). Still missing: focus
   return to the trigger on close, and it hand-rolls what Base UI gives for free.
5. **`HelpSystem`** (`components/ui/help-system.tsx`, exports `HelpSystem` +
   `KeyboardShortcutHint`) — dead code (zero importers), hardcoded
   Arabic/English labels — **delete the file**.

**Stale claim:** the issue says the drawer "has no focus trap"; `git show
fd94c41:…/advanced-search-bar.tsx` already contains `useFocusTrap` (4 refs,
added in #180). The drawer's *remaining* gaps are focus return + consistency
with the primitive layer, which the Base UI conversion below delivers.

## Approach: convert all four to Base UI `Dialog`

Base UI `Dialog.Popup` (used modally) gives us, for free: focus trap
(`FloatingFocusManager`, `modal: true`), ESC-to-close, scroll lock, focus
return on close (`finalFocus` default = previously focused element), and
`role="dialog"`. It does **not** emit `aria-modal="true"` (verified in
`node_modules/@base-ui/react/esm/dialog/popup/DialogPopup.js`), so we add
`aria-modal="true"` explicitly on each Popup, and on the shared
`components/ui/dialog.tsx` wrapper (fixes createable-select +
recovery-key-settings + the new shortcuts dialog at once).

### 1. Shared primitive — `components/ui/dialog.tsx`
- Add `aria-modal="true"` to `DialogPrimitive.Popup` in `DialogContent`
  (Base UI already sets `role="dialog"`; modal focus is guaranteed by the
  default `modal: true`, so `aria-modal="true"` is correct and matches the
  ARIA APG modal-dialog pattern).

### 2. `components/ui/search-dialog.tsx`
- Wrap in `Dialog.Root` (controlled `open={isOpen}`,
  `onOpenChange={(o) => !o && onClose()}`) + `Portal` + `Backdrop`
  (same classes as `DialogOverlay`) + `Popup` (`initialFocus={inputRef}`,
  `aria-modal="true"`, `aria-label={t("search.title")}`).
- **Input accessible name:** `aria-label={t("search.placeholder")}` on the
  input (placeholder retained → existing E2E `getByPlaceholder` keeps working).
- **Combobox/listbox semantics** (issue's explicit ask):
  - input: `role="combobox"`, `aria-expanded={displayItems.length > 0}`,
    `aria-controls={listboxId}`, `aria-activedescendant={activeOptionId}`,
    `aria-autocomplete="list"`.
  - results container: `role="listbox"`, `id={listboxId}`,
    `aria-label={t("search.results")}`.
  - each row: `<div role="option" id={optionId} aria-selected>` (options are
    not independently focusable — keyboard drives through the combobox, the
    ARIA APG pattern). `onClick`/`onMouseEnter` handlers preserved.
- **Tab fix:** only intercept Tab when the active item has children (the
  documented "Tab = expand" gesture); otherwise let native Tab move focus
  (Shift+Tab always native → no keyboard trap). Enter still activates.
- **ESC:** while an expanded sub-list is open, `e.stopPropagation()` and
  collapse (prevents Base UI's dismiss handler from also closing); otherwise
  Base UI closes via `onOpenChange` → `onClose()`.
- Remove the `setTimeout(…focus(), 100)` hack (Base UI `initialFocus`).
- **Icon buttons:** X button `aria-label={t("common.close")}`; back (ChevronLeft)
  button `aria-label={t("common.back")}` (new key).

### 3. `components/ui/keyboard-shortcuts-provider.tsx` — `KeyboardShortcutsHelp`
- Rebuild on the shared wrapper: `Dialog` + `DialogContent` +
  `DialogTitle`/`DialogHeader` (gets role/aria-modal + focus trap + ESC +
  scroll lock + labelled X close button for free).
- `onOpenChange={(o) => !o && onClose()}`. Keep the shortcut rows and the
  bottom "close" link (harmless duplicate affordance).

### 4. `hooks/use-user-journey.tsx` — `UserJourneyTour`
- Wrap the tour popup in `Dialog.Root` (controlled
  `open={journey.isActive}`) + `Portal` + `Backdrop` + `Popup`
  (`aria-modal="true"`, keep `aria-labelledby={titleId}`, `tabIndex={-1}`,
  `initialFocus={dialogRef}`).
- **ESC → skip:** `onOpenChange={(o) => !o && journey.skip()}` — ESC behaves
  exactly like the Skip button (permanently marks the first-run tour skipped;
  `JourneyState` has no paused state, and the issue explicitly wants ESC).
- `disablePointerDismissal` — prevent an accidental backdrop click from
  skipping the tour.
- Remove the manual focus `useEffect` (Base UI `initialFocus`).
- RTL-aware positioning: `start-1/2 -translate-x-1/2 rtl:translate-x-1/2`
  (mirrors `DialogContent`).

### 5. `features/shared/advanced-search-bar.tsx` — mobile filters drawer
- Convert the drawer to `Dialog.Root` (controlled
  `open={drawerOpen}`) + `Portal` + `Popup` (`aria-modal="true"`,
  `aria-label={t("search.openFilters")}`, `initialFocus` → close button;
  keep `role="dialog"` via Base UI). Full-screen drawer → no `Backdrop`.
- Delete the manual `window` ESC listener and the manual body scroll-lock
  effect (Base UI modal provides both).
- `useFocusTrap` stays for the inline **save dialog** only. Remove
  `aria-modal="true"` from the inline save dialog — it is an inline panel in
  the page flow, not a modal overlay; claiming `aria-modal` hides the rest of
  the page from AT (correct semantics: `role="dialog"` + trap, no aria-modal).
- Trigger button keeps `aria-haspopup="dialog"` + `aria-expanded`.

### 6. Delete `components/ui/help-system.tsx`
- `HelpSystem` + `KeyboardShortcutHint` have zero importers (verified by
  grep). Deleting the file removes both.

### 7. i18n — `apps/web/src/i18n/resources/ar.ts`
- `common.back: "رجوع"` (search back button).
- `search.title: "البحث"` (dialog name), `search.results: "نتائج البحث"`
  (listbox label).

## Dependencies
- `@base-ui/react@^1.2.0` (already a dependency; no new packages).
- Reuses the shared `components/ui/dialog.tsx` wrapper where the layout fits.

## Planned tests

**Unit (vitest + jsdom, `apps/web/src/**/__tests__/`):**
- `search-dialog.test.tsx` (new): opens with `role="dialog"` + `aria-modal`;
  input has an accessible name (`getByRole("combobox")`); ArrowDown/Up move
  `aria-activedescendant`; Enter activates an action item; Tab on a
  parent item expands (dialog stays open, focus stays); Tab on an action item
  does NOT run its action (native focus move); ESC collapses the expanded
  view without closing, second ESC closes; X and back buttons have
  `aria-label`s; option rows carry `role="option"`/`aria-selected`.
- `keyboard-shortcuts-help.test.tsx` (new): renders `role="dialog"` +
  `aria-modal` when open; ESC calls `onClose`.
- `use-user-journey-tour.test.tsx` (new): tour renders `role="dialog"` +
  `aria-modal` + `aria-labelledby`; ESC skips (status → `skipped` in
  localStorage); Skip/Next/Done buttons still work.
- `advanced-search-bar.test.tsx` (extend): drawer opens with
  `role="dialog"` + `aria-modal`; ESC closes; focus returns to the trigger
  button after close (`document.activeElement`).

**Playwright E2E (`tests/e2e/`):**
- `search.spec.ts` — replace the fragile `.fixed.inset-0` scoping with
  `getByRole("dialog")` (role now present; the popup is a portal sibling of
  the backdrop, so the old selector would break).
- `a11y-dialogs.spec.ts` (new):
  - Search: focus lands in the combobox on open; Tab moves focus to the
    close button (no action run); ESC closes.
  - Shortcuts help ("?"): opens with `role="dialog"`; ESC closes.
  - Tour: sign in WITHOUT the `dismissUserJourneyTour` init script; tour
    dialog appears; ESC skips it (dialog gone + `journey-home-tour-status`
    = `skipped` in localStorage).
  - Filters drawer: `setViewportSize` to mobile; open the drawer; Tab
    cycles inside it; ESC closes.

## Implementation risks
- **Behavior change (intended):** Tab no longer runs an action on a plain
  action item (only Enter does; the footer hint documented Tab as "expand"
  only). Mitigated by updating unit/E2E coverage.
- **E2E selector churn:** `.fixed.inset-0` → `getByRole("dialog")` in
  `search.spec.ts`; must not break the two existing tests.
- **Portal stacking:** dialogs now render through `Dialog.Portal`; z-index
  (z-50) and RTL transforms copied from the existing `DialogContent`.
- **Tour ESC = permanent skip:** matches the Skip button; documented in the
  issue (ESC was "documented as a shortcut" but never worked).

## Out of scope (noted for follow-up)
- The inline save-preset panel keeps its hand-rolled `useFocusTrap`
  (aria-modal removed only).
- No axe-core integration in this repo's test stack (not present; adding it
  is a separate concern).
