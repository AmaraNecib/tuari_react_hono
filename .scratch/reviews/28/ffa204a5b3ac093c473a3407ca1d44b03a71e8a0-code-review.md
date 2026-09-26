# Code review — issue #28 (Standard tier)

- reviewed HEAD: `ffa204a5b3ac093c473a3407ca1d44b03a71e8a0`
- base SHA: `fbb7d02` (`origin/develop`)
- diff reviewed: `fbb7d02..ffa204a5` — `select.tsx` (default flip + CSS trim), `createable-select.test.tsx` (+2 jsdom tests, hardened), `.scratch/implementation/28-design.md`
- review method: fresh-context read-only code-review subagent against `fbb7d02..6fca763`, then verified the `6fca763..ffa204a5` delta (test-only: one added assertion from audit P2-1, one jsdom-seam comment, doc line-ref fixes; `apps/web/src/components/ui/select.tsx` is byte-identical between both SHAs)

## Verdict: APPROVE — no blocking findings (P0/P1 none)

## Standards axis

- Design-doc-first: `28-design.md` states the accepted root cause, the exact change, and the trade-off before production code.
- Repo/staging discipline (AGENTS.md): only source + test + design + evidence staged; no scratch/session noise. Pre-commit hygiene hooks passed.
- Conventions: `alignItemWithTrigger = false` default keeps the prop in the public `Pick<SelectPrimitive.Positioner.Props, ...>` type for explicit opt-in, matching the primitive's existing pattern. The explanatory comment is concise. Dead CSS fully removed — `origin-(--transform-origin)`, `data-[align-trigger=true]:animate-none`, and the `data-align-trigger` attribute — with no orphaned classes. Standard Base UI floating-select styling retained (`min-w-36`, `w-(--anchor-width)`, `max-h-(--available-height)`, side-based `slide-in-from-*`, `fade-in-0`/`fade-out-0`).

## Spec axis (vs. the required fix)

- Primary: default `alignItemWithTrigger = false` — implemented (`select.tsx:93`).
- Secondary: `zoom-in-95`/`zoom-out-95` dropped, `fade-in-0`/`fade-out-0` kept — implemented.
- Removed now-unused trigger-alignment CSS/DOM — implemented.
- Out of scope untouched: the four named consumer call sites, `search-dialog.tsx`, `@base-ui/react` upgrade.
- Tests: both new jsdom tests match the design doc's coverage plan; 13/13 targeted, 564/564 full `test:web`.

## Findings

- **P0 — none.**
- **P1 — none.**
- **P2-1 (note):** `apps/web/src/features/inventory/item-list-editor.tsx` also consumes the shared `Select` directly (5th surface) and now renders a standard bottom-anchored dropdown. Consistent with the intended shared heal; not a regression. Acknowledged in `28-design.md`.
- **P2-2 (note):** jsdom pins the fix structurally (attribute/class absence + fade presence); real synchronous-placement/click verification is delegated to lane #25's Playwright checklist (in-viewport, open→click→selected-name, 10–15× flakiness loop, keyboard ArrowDown×3→Enter, low-viewport trigger-edge). Documented in `28-design.md`.
- **P2-3 (residual, documented):** the optional move of `max-h`/`overflow` from Popup to `Select.List` was deferred. Keyboard navigation still works via native `scrollIntoView` (useListNavigation standard path, verified in `@base-ui/react@1.2.0` source); Base UI scroll-arrow auto-visibility on very long lists remains latent — pre-existing, non-regressive, outside the reported click bug. See design doc "Deliberately NOT changed".
- **P2-4 (hygiene, fixed):** design doc internal line refs were stale after the comment insertion and lacked a trailing newline — corrected in `ffa204a5`.

## Notes

- Verified in installed `@base-ui/react@1.2.0` source: with `alignItemWithTrigger=false`, `SelectPopup.js` sets `initialPlacedRef.current = true` synchronously in the open layout effect and removes `--transform-origin` from the popup; the queueMicrotask re-place path only runs when the mode is on. `--transform-origin` is never set by adaptive-origin middleware (no arrow element on this popup).
- No consumer anywhere passes `alignItemWithTrigger` explicitly — only the internal positioner passthrough.