# #53 — Upgrade @base-ui/react ^1.2.0 → 1.7.x

- **Ticket:** #53 [enhancement] — GitHub issue; remote repo available (parent owns push/PR).
- **Mode:** remote.
- **Base:** `origin/develop` @ `a23eaaf` (includes the #44 combobox regression spec).
- **Target ref:** `origin/chore/issue-53-base-ui-1-7`.
- **Review tier:** Standard (dependency upgrade touching shared UI primitives).

## Scope

- Bump `@base-ui/react` `^1.2.0` → `^1.7.0` (exact lockfile resolution: 1.7.0) in
  `apps/web/package.json` + `pnpm-lock.yaml`.
- Verify the wrapped primitives in `apps/web/src/components/ui/` still compile and
  behave under 1.7.0 with **zero wrapper API changes** where possible.
- Keep `tests/e2e/select-combobox-regression.spec.ts` and its assertions byte-for-byte
  untouched.

## Upstream delta analysis (1.2.0 → 1.7.0)

Read the shipped `CHANGELOG.md` for 1.3.0, 1.4.0, 1.4.1, 1.5.0, 1.6.0, 1.7.0, and
diffed the `.d.ts` surfaces of every part we wrap (Select, Popover, Dialog, Tabs,
Tooltip, Checkbox, Separator, Button).

**Result:** No breaking changes to our wrapped API surface. All changes are fixes,
additive parts, or internal packaging (.mjs/.d.mts dual output). The only notable
behavior changes relevant to us:

1. **Select mouse-selection hardening (#4699, v1.5.0)** — an item click only commits
   when the press *started on the item* (`allowMouseSelectionRef`, set by
   `pointerdown`); bare synthetic clicks are treated as ghost/drag clicks and
   ignored. Real browsers (incl. Playwright `.click()`, which fires the full pointer
   sequence) are unaffected; jsdom tests that simulated a pick with
   `fireEvent.mouseEnter` + `fireEvent.click` now get silently ignored.
   - **Impact:** `apps/web/src/components/ui/createable-select.test.tsx`, two pick
     simulations. Fixed by dispatching `fireEvent.pointerDown(..., {pointerType:
     "mouse"})` before the click (see `pickOption` helper) — mirrors a real mouse
     press. The test's pinned assertions (alignItemWithTrigger default OFF, no zoom
     animation, issue #28) are untouched.
2. **Select `alignItemWithTrigger` zoom fallback fix (#4292, v1.3.0)** and RTL
   position fix (#4531, v1.4.0) — both *improve* the mode we keep disabled.
3. v1.3.0: "Snap `--anchor-width`/`--anchor-height` to device pixel grid" (#4082) —
   keeps our `w-(--anchor-width)` popup sizing intact.

No `@deprecated` markers in any part we import.

## Public contracts preserved

- `alignItemWithTrigger` default stays `false` in `SelectContent` (synchronous
  floating placement, issue #28 regression protection).
- No zoom transforms / `origin-(--transform-origin)` classes re-introduced.
- No wrapper prop renames; call sites unchanged.
- `tests/e2e/select-combobox-regression.spec.ts`: not modified.

## Changed files

- `apps/web/package.json` — dep bump.
- `pnpm-lock.yaml` — resolution 1.7.0.
- `apps/web/src/components/ui/createable-select.test.tsx` — jsdom pick simulation
  adapted to the new pointerdown contract (intent preserved).

## Validation gates

- [x] `pnpm --filter @tuari/contracts build`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm --filter @tuari/web test` (74 files / 634 tests)
- [x] `pnpm test:e2e` — 59/59 green (2 full runs; the isolated rerun confirms the one
      first-run `admin-account` failure was a flake, not a regression)
- [x] `pnpm test` (repo checks + api 1255✅ + web 634✅)
- [x] `pnpm test:api` — 71 files / 1255 tests
- [x] no new @base-ui deprecation warnings in dev output (full dev-server log grep: zero matches)

## Risks / notes

- Full-suite `vitest run` can flake under parallel worker contention (observed
  timeouts/text-not-found that pass on isolated rerun and on the final clean run);
  the final full run was green 74/74.
- E2E owns ports 3000/4318; verified no stale listeners before the run.