# Test audit — issue #28 (Standard tier)

- reviewed HEAD: `ffa204a5b3ac093c473a3407ca1d44b03a71e8a0`
- base SHA: `fbb7d02` (`origin/develop`)
- scope: `createable-select.test.tsx` (2 new #28 tests + 5 pre-existing #24 display-name tests) and `inventory-invoice-create-page.test.tsx` (unchanged, #24 guard)
- review method: fresh-context read-only test-audit subagent against `fbb7d02..6fca763`; the `6fca763..ffa204a5` delta applies the audit's own P2-1 suggestion and documents the jsdom unmount seam (P2-2)

## Verdict: PASS — no blocking findings (P0/P1 none)

## Coverage (jsdom seam)

- **New test 1 (open without trigger-aligned mode / scale animation):** asserts no `data-align-trigger` attribute, no `zoom-in-95`, no `transform-origin` in the popup class, and `fade-in-0` still present — pins the DOM direction of the shipped fix. Non-tautological: the assertions would change if the mode/CSS regressed.
- **New test 2 (successive open/select/close/reopen/select cycles):** ordered assertions `toHaveBeenCalledWith("wh-2")` → `toHaveBeenCalledTimes(2)` → `toHaveBeenLastCalledWith("wh-1")` prove commit survives repeated open/close cycles; implicitly exercises Base UI's toggle-on-`mousedown` close path.
- **#24 contract preserved:** the five display-name tests still encode explicit `displayValue` → matched option name → raw value → placeholder empty label; verified against unchanged `resolvedDisplayValue` in `createable-select.tsx`. Persistence-across-re-render coverage intact.

## Findings

- **P0 — none.**
- **P1 — none.**
- **P2-1 (hardening, applied):** add `not.toContain("transform-origin")` to the popup DOM assertion to pin removal of `origin-(--transform-origin)` — applied in `ffa204a5`.
- **P2-2 (seam, documented):** asserting popup unmount between cycles (`queryByRole(...).toBeNull()`) fails in jsdom — Base UI keeps the popup mounted through the exit transition and jsdom never fires `transitionend`. Attempted empirically, reverted, and the limitation is documented in the test comment. The cycle's reopen assertion still covers the close/reopen path behaviorally.
- **P2-3 (deferrals, correct — not coverage holes):** real coordinate placement, in-viewport assertion, 10–15× commit-on-click flakiness loop, keyboard ArrowDown×3→Enter, and low-viewport trigger-edge cannot be modeled in jsdom (no layout; `scrollIntoView` no-op; the CDP box-model error needs a real browser). Delegation to lane #25's Playwright checklist is legitimate and documented in `28-design.md`. The scroll-arrow scroller residual (`listElement || popupElement`) is also documented there.
- **P2-4 (pre-existing, out of scope):** `__create_new__` dialog flow and `disabled` prop have no unit coverage (predates this PR); empty-options is only indirectly covered. Not introduced by #28.

## Flakiness assessment

- Cycle test empirically stable: targeted runs 13/13 twice and full `test:web` 564/564. Arabic roles/text queried via `within(listbox).findByRole("option", { name })` — stable. No new timers or real-timing dependencies; all waits are `findBy*`/`waitFor` on RTL-polled DOM.

## Commands

- `npx vitest run src/components/ui/createable-select.test.tsx src/features/inventory/inventory-invoice-create-page.test.tsx` (apps/web) → 13/13 passed.
- `pnpm test:web` (full suite at `6fca763`) → 67 files / 564 tests passed.