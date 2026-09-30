# Theme-contrast review fixes — `57b9ac5b`

**Base:** `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
**Reviewed lane HEAD:** `45fef16df54709393501884ced94e4c871edcce5`
**Fix commit:** `57b9ac5b03413d9b30149e1c8025452d452620a3`
**Mode:** local-only lane; parent owns push/PR. Reviews: debate, code-review,
test-audit (all read-only, fresh context). Their raw evidence sits next to this
file as `<45fef16d>-debate.md`, `<45fef16d>-code-review.md` and
`<45fef16d>-test-audit.md`.

## Findings and verdicts

| # | Sev | Finding (source) | Verdict | Fix |
| --- | --- | --- | --- | --- |
| 1 | high | `::selection` + the `select { color-scheme }` rule had zero coverage; no test environment loads `styles.css` (test-audit F1) | CONFIRMED | new `web-hygiene/theme-contrast.test.ts` reads the stylesheet and pins the surface mix + per-theme `color-scheme` + no `select option` override |
| 2 | high | `data-highlighted` was never driven at runtime, so wrong attribute names (dead CSS) would still pass (F2) | CONFIRMED | createable-select test asserts the rendered `data-selected`/`data-highlighted` attributes and that ArrowDown moves the highlight |
| 3 | med | `dark:placeholder:text-muted-foreground` is matched by the `/80` substring, so the assertion cannot fail on the regression it guards (S3a/F6) | CONFIRMED | all placeholder assertions are exact-token; `…/80` is explicitly rejected |
| 4 | med | `select.tsx:58` `dark:data-placeholder:*` changed but unasserted (F3) | CONFIRMED | createable-select asserts `data-placeholder` plus the exact dark token |
| 5 | med | `date-picker.tsx:139` `button_next` never asserted (F5) | CONFIRMED | test loops over both `nav button`s |
| 6 | med | the nav buttons' `disabled:*` variants are dead CSS: react-day-picker sets `aria-disabled` + `tabIndex={-1}`, never `disabled` (debate C11 / test-audit F7) | CONFIRMED | switched to `aria-disabled:*`; the generated CSS is `[aria-disabled=true]` |
| 7 | med | the NativeSelect assertions pin unchanged classes; the real `select` change is untested (S3b) | CONFIRMED | covered by finding 1; the control-level test now also asserts the shared dark token |
| 8 | med-low | expenses duplicated `RecordPageFrame`'s root instead of using it; the test enshrined the copy (F9) | CONFIRMED | expenses renders through `RecordPageFrame` |
| 9 | low | `toContain("bg-popover")` on a zero-pixel rename; the test comment overstates it (F8) | CONFIRMED | comment corrected; assertion kept as a semantic pin |
| 10 | low | placeholder pair was copy-pasted in three places (S4) | CONFIRMED | exported `placeholderContrastClassName`, reused in all three sites; the hygiene test enforces one definition |
| 11 | low | dangling JSDoc opening line in `createable-select.test.tsx` (S6) | CONFIRMED | restored |
| 12 | low | design doc's `::selection`/highlight/placeholder numbers did not reproduce (C7/P3c/P5) | CONFIRMED | doc corrected: dark highlight 12.8:1 vs 8.6:1 (previous already AA); dark placeholder 7.2:1 vs 5.0:1 |
| 13 | low | coverage thresholds absent in `vitest.config.ts` (F13) | CONFIRMED, deferred | out of lane scope; proposed follow-up, parent decision requested |
| 14 | info | `select.tsx:207/228` scroll-arrow `bg-popover` unasserted (F4) | DISMISSED | `--card === --popover === var(--surface)`, so the change is a no-op; the arrows do not render in jsdom (`visible = stateVisible && openMethod !== 'touch'`), so no DOM assertion is possible |
| 15 | info | probe test file present (S5/F14) | DISMISSED | throwaway probe deleted before the commit; `git status` is clean |
| 16 | info | `bg-card` to `bg-popover`, dark cascade, `color-scheme` ordering, chevron className forwarding (C6/C8/C10, S3c) | DISMISSED with proof | Base UI 1.7.0 emits bare `data-selected=""`/`data-highlighted=""` (probed); the built CSS has `.dark\:data-\[highlighted\]\:text-foreground:is(.dark *)[data-highlighted]` at specificity (0,3,0) over (0,2,0); react-day-picker forwards `classNames.chevron` straight to the `<svg>` whose `<polygon>` has no fill |

## Pre-fix proof matrix

Each production file was reverted to the base SHA, the matching test run, then
restored. Failures are the expected ones (all exit non-zero on the reverted
tree, exit 0 on the fix).

| Reverted to base | Test | Result on base |
| --- | --- | --- |
| `select.tsx` | `createable-select.test.tsx` | 2 failed (`bg-popover`, dark placeholder) |
| `date-picker.tsx` | `date-picker.test.tsx` | 2 failed (`fill-current`, `aria-disabled:cursor-not-allowed`) |
| `form-controls.tsx` + `employee-batch-row-card.tsx` | both test files | 4 failed (dark token on Input/Textarea/Currency/NativeSelect/notes) |
| `expenses-page.tsx` | `expenses-page.test.tsx` | 1 failed (`p-6` present) |
| `styles.css` | `theme-contrast.test.ts` | 2 failed (selection mix, select color-scheme) |
| duplicate token injected into another src file | `theme-contrast.test.ts` | 1 failed (single-definition guard is discriminating) |

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/web test --maxWorkers=2` | 86 files / 737 tests passed, exit 0 |
| `pnpm typecheck` | 4/4 tasks successful, exit 0 |
| `pnpm lint` | exit 0; `check:unslop` PASS (1662 warn / 0 error) |
| `npx tsc -p apps/web/tsconfig.json --noEmit` | exit 0 |
| `npx eslint .` (apps/web) | exit 0 |
| `npx vitest run <6 touched files> --coverage --maxWorkers=2` | 6 files / 35 tests passed, exit 0 |
| `npx vite build` (apps/web) | exit 0, used to inspect the generated CSS |

Scoped coverage (touched tests only, no thresholds configured): `select.tsx`
70/83.33, `date-picker.tsx` 94.73/84.61, `form-controls.tsx` 58.33/20,
`expenses-page.tsx` 72.15/62.5, `employee-batch-row-card.tsx` 27.27/47.36
(stmts/branch). The changed lines are covered; the uncovered lines are
pre-existing branches (`SelectGroup`/`SelectLabel`/`SelectSeparator`,
`FileInput`/`FieldSection`, the card's other fields).

## Visual check (re-rendered)

Built the real stylesheet, loaded it in Chromium with the real utility classes
for the selection, input placeholder, native select, Base UI popup (popover
surface + `data-highlighted` item) and the nav chevron, then measured computed
styles in both themes:

- light: selection `#f0d5cb` with `#171717` text (unchanged); popup `#ffffff`
  with `#171717`; highlighted item `#f0e0d3` with `#404040`; chevron fill
  `#595959`; placeholder 80% mix.
- dark: selection `oklab(0.3357 …)` (~`#473125`) with `#f0ebe0` text
  (~10.2:1); popup `#1f1c18` with `#f0ebe0`; highlighted item `#2e2418` with
  `#f0ebe0`; chevron fill `#a8a298`; placeholder `#a8a298` at full opacity.

Screenshots: `D:/projects/tuari_react_hono/tmp/theme-harness-{light,dark,dark-zoom}.png`.
The throwaway harness HTML was deleted.

## Not verified

- A real Windows/macOS native `<select>` popup (the OS list is not renderable
  from the page); the closed control and `color-scheme` are the only knobs and
  are pinned in CSS tests.
- The react-day-picker disabled nav state at runtime: this `DatePicker` exposes
  no `fromDate`/`toDate`, so RDP never sets `aria-disabled` here. The variants
  now match the library's actual signal but the state is unreachable until a
  range limit is added.
- A pixel diff of `::selection`; `getComputedStyle(el, "::selection")` resolves
  the colour pair, which is what was measured.
