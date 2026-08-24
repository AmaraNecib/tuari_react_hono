# Code review — #53 @base-ui/react 1.2.0 → 1.7.0

- **Reviewed HEAD:** `dc7977d` (code commit; followed by an evidence-only commit).
- **Base:** `origin/develop` @ `a23eaaf`.
- **Scope:** dependency bump only. Production wrappers unchanged; one jsdom unit
  test event simulation updated.
- **Mode:** remote (parent owns push/PR).

## Diff under review

| File | Change |
| --- | --- |
| `apps/web/package.json` | `@base-ui/react ^1.2.0` → `^1.7.0` |
| `pnpm-lock.yaml` | resolution `1.2.0` → `1.7.0` (verified `apps/web/node_modules/@base-ui/react/package.json` = 1.7.0) |
| `apps/web/src/components/ui/createable-select.test.tsx` | pick simulation: `fireEvent.mouseEnter` + `fireEvent.click` → `pickOption` (pointerdown + click) |
| `.scratch/implementation/53-design.md` | decision record |

## Standards axis

- Upgrade is exact-minor per lockfile (1.7.0, latest).
- No wrapper API changes introduced — verified by auditing the 1.3→1.7 changelog
  and diffing the `.d.ts` surface of every imported part (Select, Popover, Dialog,
  Tabs, Tooltip, Checkbox, Separator, Button). Diff shows doc-comment/JSDoc and
  internal-import-only changes (`utils/` → `internals/`), dual `.mjs`/`.d.mts`
  packaging. No prop removals/renames; `alignItemWithTrigger` still present.
- 🟠 Noted behavior change (upstream 1.5.0 #4699): select item clicks require the
  press to originate on the item (`allowMouseSelectionRef` via `pointerdown`).
  This is the **wrapper's dependency** hardening, not a bug we introduced. Real
  browser flows (Playwright `.click()` = pointerdown→pointerup→click) commit
  normally; all 7 regression specs pass unmodified.
- Test change is intent-preserving: same option picked in each cycle, same
  assertions. The file's pinned issue-#28 assertions (no trigger-aligned mode, no
  zoom-in animation, `data-align-trigger` null) are untouched and still pass.
- No `@deprecated` markers exist in any part we import (grep of 1.7.0 typings).
- On first full e2e run `admin-account.spec.ts:127` failed; isolated rerun passed
  4/4 and the subsequent full run passed 59/59 → flake, not regression (DB shared
  across serial specs; `resetE2eDatabase` per test).

## Spec axis

Against the brief's acceptance criteria:

1. ✅ Bump to ^1.7.0, exact 1.7.0 resolution, clean reinstall.
2. ✅ Changelog/migration notes read (1.3.0, 1.4.0, 1.4.1, 1.5.0, 1.6.0, 1.7.0).
3. ✅ Wrappers adapted only where API genuinely changed — none required. Public
   wrapper props and behavior contracts preserved (`alignItemWithTrigger` default
   false, no zoom transforms, synchronous anchor placement).
4. ✅ `tests/e2e/select-combobox-regression.spec.ts` unmodified; all 7 pass.
5. ✅ No new console deprecation warnings from @base-ui (dev-server log grep clean).

## Validation matrix (all green)

- `pnpm --filter @tuari/contracts build` ✅
- `pnpm typecheck` (4/4 tasks) ✅
- `pnpm lint` (2/2 tasks) ✅
- `pnpm --filter @tuari/web test` — 74 files / 634 tests ✅
- `pnpm test:api` — 71 files / 1255 tests ✅
- `pnpm test` — repo checks + api + web ✅
- `pnpm test:e2e` — 59/59 ✅ (2 full runs)

## Verdict

Ready to push. No actionable findings. No deferrals.