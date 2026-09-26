# Issue #28 — Custom combobox dropdown clicks intermittently fail (CDP box-model error)

- mode: pipeline crew lane, remote available (parent owns push/PR; lane pushes branch, never merges)
- ticket #28 (crew), branch `fix/issue-28-combobox`
- base SHA: `fbb7d02` (`origin/develop` — HEAD equals base at start, clean tree)
- review tier: Standard

## Accepted root cause (read-only audit, verified against current code + installed Base UI source)

`CreateableSelect` (`apps/web/src/components/ui/createable-select.tsx`) wraps the shared
`Select` primitive (`apps/web/src/components/ui/select.tsx`, Base UI `@base-ui/react` 1.2.0:
Portal → Positioner → Popup → List). `SelectContent` forced `alignItemWithTrigger = true`
(select.tsx:86) and passed it to the Positioner. Verified in `SelectPopup.js`:

1. **Async fixed-position race (the CDP box-model error).** With the align mode active, the
   positioner is a fixed box whose un-offset static position lands ~100vh (below the fold of
   the portal appended to `<body>` inside the 100%-viewport `.tauri-shell`). On open,
   SelectPopup.js:242 re-measures and re-places inside a `queueMicrotask` — after the first
   paint of the open state — so an option's box moves between the box-model query and the
   pointer dispatch. With the mode off, the popup is placed by the standard floating path
   (side="bottom", collide-aware, synchronous layout effect) before paint; no re-place.

2. **Scroll gate no-op.** `initialPlacedRef` was only set inside a `setTimeout` macrotask in
   the align path (SelectPopup.js:338). With the mode off it is set synchronously in the
   open layout effect (SelectPopup.js:229-233), so nothing is gated behind a macrotask.

3. **Keyboard scroll-miss.** In the align path Base UI manipulates `scroller.scrollTop` where
   `scroller = listElement || popupElement` (SelectPopup.js:107). `SelectList.js` registers
   `onScroll` on the List and the root's `handleScrollArrowVisibility` reads
   `listElement || popupRef` — but the List is a plain non-scrolling div (overflow lives on
   the Popup), so those writes were no-ops. In the standard path the keyboard path is
   `useListNavigation`, which calls native `scrollIntoView({ block: 'nearest' })`
   (useListNavigation.js:148-153) — the browser scrolls the scrolling Popup natively. No
   List/Popup scroller mismatch remains.

4. **Animation origin flip.** The popup combined `origin-(--transform-origin)` with
   `fade-in-0 zoom-in-95`. `--transform-origin` is only ever written by the align path's
   microtask (adaptive-origin middleware requires an arrow element; the Select popup has
   none — useAnchorPositioning.js:218-253). At animation start the var is unset, Base UI
   sets it mid-animation → origin flip + scale-jump during the first 100ms → the clickable
   box moves under a fast click. Off-by-default removes the writer; dropping the zoom class
   removes the animation dependency entirely.

One shared primitive — the four affected surfaces (invoice-create counterparty/warehouse/
project, debt-create, warehouse-form, outbound-transfer v2) all use `CreateableSelect`, plus
`item-list-editor.tsx` consumes the shared `Select` directly (a fifth surface) — so the fix
lives in `select.tsx` and heals all of them. `search-dialog.tsx` is a separate Dialog
combobox and is untouched.

## Fix

Primary (one prop, select.tsx:93):

- Default `alignItemWithTrigger = false`. The prop stays in the public type for explicit
  opt-in, but the default switches the popup to standard floating positioning (side="bottom",
  collide-aware, synchronous coords). `SelectPopup.js` then removes `--transform-origin` from
  the popup element on open.

Secondary (same PR, select.tsx Popup styling at select.tsx:113):

- Drop the scale animation: remove `data-open:zoom-in-95` and `data-closed:zoom-out-95`
  (keep `fade-in-0` / `fade-out-0`). Removes the mid-click box shift class of bug even if the
  var were ever set.
- Remove now-dead trigger-alignment CSS/DOM: `origin-(--transform-origin)`,
  `data-[align-trigger=true]:animate-none`, and the `data-align-trigger` attribute on the
  Popup. Nothing in the repo passes the prop, so these are unused once the default flips.

Deliberately NOT changed (deferral candidates, see risks):

- Moving `max-h-(--available-height)` + `overflow-x-hidden` + `overflow-y-auto` from Popup
  onto `Select.List` (brief's optional hardening). With the align mode off, keyboard
  navigation scrolls via native `scrollIntoView` on the scrolling Popup (useListNavigation
  standard path), so the keyboard scroll-miss is resolved without it. The Base UI scroll-arrow
  auto-visibility still reads `listElement` (non-scrolling List) and stays latent — same
  behavior as before this change; the scroll buttons are decorative in this app and the
  reported bug is click-based. Deferring avoids an unverifiable layout/DOM change this round
  (no Playwright in this lane; lane #25 owns the E2E regression checklist).
- Upgrading `@base-ui/react` — explicitly out of scope (parent-decided follow-up).
- Consumers' call sites, `search-dialog.tsx` — untouched.

## Trade-off (accepted)

The "selected item aligns with the trigger" nicety is lost: the popup becomes a normal
bottom-anchored dropdown (side="bottom", sideOffset 4, align=center) and the scale animation
is removed (fade only). This is the standard shadcn/Base UI floating-select behavior and the
price of synchronous, pre-paint placement.

## Tests

- `apps/web/src/components/ui/createable-select.test.tsx` (jsdom): keep the #24 display-name
  derivation suite green; add
  1. a DOM-level assertion that the open popup no longer carries the trigger-aligned mode or
     the scale animation (`no data-align-trigger` attribute, no `zoom-in-95`, `fade-in-0`
     present) — directly pins the shipped fix,
  2. an open → select → toggle-close → open → select-again cycle asserting both commits land
     (`onChange` twice, in order) — covers the intermittent-click surface that jsdom can model.
- `apps/web/src/features/inventory/inventory-invoice-create-page.test.tsx`: untouched, must
  stay green (guard against #24 display-name regressions).

## Verification (this lane)

Contracts build, typecheck, lint, test:api, test:web — all green locally. NO Playwright
(lane #25 owns E2E; regression checklist: in-viewport assertion, open→click→selected-name,
10-15x flakiness loop, keyboard ArrowDown×3→Enter, low-viewport trigger-edge pass). CI runs
e2e after merge. Evidence under `.scratch/reviews/28/`.

## Risks / notes

- Opt-in `alignItemWithTrigger={true}` still exhibits the Base UI align race; nothing in the
  repo uses it. If a future caller needs trigger-alignment it should be reworked with the
  upgraded Base UI (follow-up).
- Base UI in jsdom: interactions use `fireEvent.mouseDown(trigger)` then
  `mouseEnter`+`click` on `role="option"`; toggle-close is a second `mouseDown` on the trigger
  (useClick `toggle=true`, event `mousedown`).
- Scroll-arrow auto-visibility remains latent (List is not the scroll container). No
  behavioral regression vs. the pre-change state.
